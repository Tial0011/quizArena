import { app, db } from "../firebase/config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  arrayUnion,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   FRIEND GROUP SERVICE

   Sole reader/writer for "friendGroups" and "groupJoinRequests" —
   same pattern as purchaseService.js / attemptsService.js.

   friendGroups/{id}:
   { name, code, ownerId, ownerName, memberIds: [uid...], createdAt }

   groupJoinRequests/{id}:
   { groupId, requesterId, requesterEmail, requesterName, status: "pending"|"accepted"|"rejected", createdAt }

   RULES:
   - A user can OWN at most MAX_GROUPS_OWNED group.
   - A user can be a MEMBER of at most MAX_GROUPS_JOINED groups
     total (owned group counts toward this).
   - A group only unlocks the Global Challenge once it has
     MIN_GROUP_SIZE_FOR_ELIGIBILITY (3) or more members.

   There's a single leaderboard now — the Global Challenge — no
   separate all-time board. It's individual (your own score drives
   it), resets weekly, spans every quiz (not one hardcoded
   subject), and your qualifying group gives you a small nudge.
========================================================= */

const MAX_GROUPS_OWNED = 1;
const MAX_GROUPS_JOINED = 3;
const MAX_GROUP_MEMBERS = 5;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 (avoid ambiguity)
const getGlobalChallengeLeaderboardCallable = httpsCallable(
  getFunctions(app),
  "getGlobalChallengeLeaderboard",
);
const LEADERBOARD_CACHE_TTL_MS = 60 * 1000;
const GROUP_DETAIL_CACHE_TTL_MS = 60 * 1000;
const MY_GROUPS_CACHE_TTL_MS = 60 * 1000;
const leaderboardCache = new Map();
const groupDetailsCache = new Map();
const myGroupsCache = new Map();

function generateCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Creates a new friend group owned by the given user. Enforces the
 * 1-group-owned and 3-groups-joined caps before touching Firestore.
 * Retries a few times on the rare chance of a code collision.
 */
export async function createFriendGroup(ownerId, ownerName, groupName) {
  if (!ownerId || !groupName) {
    return { success: false, message: "Missing group name." };
  }

  const [ownedSnap, myGroups] = await Promise.all([
    getDocs(
      query(collection(db, "friendGroups"), where("ownerId", "==", ownerId)),
    ),
    getMyGroups(ownerId),
  ]);

  if (!ownedSnap.empty) {
    return {
      success: false,
      message: `You can only own ${MAX_GROUPS_OWNED} group at a time.`,
    };
  }

  if (myGroups.length >= MAX_GROUPS_JOINED) {
    return {
      success: false,
      message: `You're already in ${MAX_GROUPS_JOINED} groups — leave one before creating another.`,
    };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();

    const existing = await getDocs(
      query(collection(db, "friendGroups"), where("code", "==", code)),
    );

    if (!existing.empty) continue; // collision, try again

    const groupRef = await addDoc(collection(db, "friendGroups"), {
      name: groupName,
      code,
      ownerId,
      ownerName: ownerName || "",
      memberIds: [ownerId],
      createdAt: serverTimestamp(),
    });
    myGroupsCache.delete(ownerId);

    return { success: true, groupId: groupRef.id, code };
  }

  return {
    success: false,
    message: "Couldn't generate a unique code. Please try again.",
  };
}

/**
 * Submits a request to join a group by its code. Prevents
 * duplicate pending requests, joining a group you're already in,
 * and exceeding the MAX_GROUPS_JOINED cap.
 */
export async function requestToJoinGroup(
  code,
  requesterId,
  requesterEmail,
  requesterName,
) {
  if (!code || !requesterId) {
    return { success: false, message: "Missing information." };
  }

  const myGroups = await getMyGroups(requesterId);
  if (myGroups.length >= MAX_GROUPS_JOINED) {
    return {
      success: false,
      message: `You're already in the maximum of ${MAX_GROUPS_JOINED} groups.`,
    };
  }

  const groupSnap = await getDocs(
    query(
      collection(db, "friendGroups"),
      where("code", "==", code.toUpperCase().trim()),
    ),
  );

  if (groupSnap.empty) {
    return { success: false, message: "No group found with that code." };
  }

  const groupDoc = groupSnap.docs[0];
  const group = groupDoc.data();

  if ((group.memberIds || []).length >= MAX_GROUP_MEMBERS) {
    return { success: false, message: "This group is full (5 members maximum)." };
  }

  if ((group.memberIds || []).includes(requesterId)) {
    return { success: false, message: "You're already in this group." };
  }

  const existingRequest = await getDocs(
    query(
      collection(db, "groupJoinRequests"),
      where("groupId", "==", groupDoc.id),
      where("requesterId", "==", requesterId),
      where("status", "==", "pending"),
    ),
  );

  if (!existingRequest.empty) {
    return {
      success: false,
      message: "You already have a pending request for this group.",
    };
  }

  await addDoc(collection(db, "groupJoinRequests"), {
    groupId: groupDoc.id,
    requesterId,
    requesterEmail: requesterEmail || "",
    requesterName: requesterName || "",
    status: "pending",
    createdAt: serverTimestamp(),
  });

  return { success: true, groupName: group.name };
}

/**
 * Groups where the given user is a member (owner or accepted
 * member — memberIds includes owners too, see createFriendGroup).
 */
export async function getMyGroups(userId) {
  if (!userId) return [];
  const cached = myGroupsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const snapshot = await getDocs(
    query(
      collection(db, "friendGroups"),
      where("memberIds", "array-contains", userId),
    ),
  );

  const groups = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  myGroupsCache.set(userId, { value: groups, expiresAt: Date.now() + MY_GROUPS_CACHE_TTL_MS });
  return groups;
}

/**
 * Pending join requests for a group. Caller is responsible for
 * only showing these to the group's owner.
 */
export async function getPendingRequests(groupId) {
  if (!groupId) return [];

  const snapshot = await getDocs(
    query(
      collection(db, "groupJoinRequests"),
      where("groupId", "==", groupId),
      where("status", "==", "pending"),
    ),
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * Accepts a pending join request. Re-checks the requester's group
 * count at accept-time (not just at request-time) — they may have
 * joined other groups while this request sat pending, so this is
 * what actually enforces MAX_GROUPS_JOINED. If they're already at
 * the cap, the request is auto-rejected instead of silently
 * exceeding the limit.
 */
export async function acceptJoinRequest(requestId, groupId, requesterId) {
  const groupSnap = await getDoc(doc(db, "friendGroups", groupId));
  if (!groupSnap.exists()) {
    return { success: false, message: "This group no longer exists." };
  }
  const group = groupSnap.data();
  if ((group.memberIds || []).length >= MAX_GROUP_MEMBERS) {
    await updateDoc(doc(db, "groupJoinRequests", requestId), {
      status: "rejected",
    });
    return { success: false, message: "This group is full (5 members maximum)." };
  }

  const myGroups = await getMyGroups(requesterId);

  if (myGroups.length >= MAX_GROUPS_JOINED) {
    await updateDoc(doc(db, "groupJoinRequests", requestId), {
      status: "rejected",
    });

    return {
      success: false,
      message: `This student is already in ${MAX_GROUPS_JOINED} groups and can't join another.`,
    };
  }

  const requestRef = doc(db, "groupJoinRequests", requestId);
  const groupRef = doc(db, "friendGroups", groupId);
  const outcome = await runTransaction(db, async (transaction) => {
    const [requestSnap, liveGroupSnap] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(groupRef),
    ]);
    if (!requestSnap.exists() || !liveGroupSnap.exists()) {
      return { success: false, message: "The request or group no longer exists." };
    }

    const request = requestSnap.data();
    const memberIds = liveGroupSnap.data().memberIds || [];
    if (request.groupId !== groupId || request.requesterId !== requesterId) {
      return { success: false, message: "This join request does not match the group." };
    }
    if (request.status !== "pending") {
      return { success: false, message: "This request has already been handled." };
    }
    if (memberIds.includes(requesterId)) {
      transaction.update(requestRef, { status: "accepted" });
      return { success: true };
    }
    if (memberIds.length >= MAX_GROUP_MEMBERS) {
      transaction.update(requestRef, { status: "rejected" });
      return { success: false, message: "This group is full (5 members maximum)." };
    }

    transaction.update(requestRef, { status: "accepted" });
    transaction.update(groupRef, { memberIds: arrayUnion(requesterId) });
    return { success: true };
  });

  if (!outcome.success) return outcome;

  myGroupsCache.delete(requesterId);

  return { success: true };
}

export async function rejectJoinRequest(requestId) {
  await updateDoc(doc(db, "groupJoinRequests", requestId), {
    status: "rejected",
  });
}

/**
 * Finds a specific user's 1-indexed rank within the FULL ranked
 * list (`all` from getGlobalChallengeLeaderboard), not just the
 * displayed top slice. Returns null if they're not ranked.
 */
export function findGlobalRank(allRanked, userId) {
  const index = allRanked.findIndex((entry) => entry.uid === userId);
  if (index === -1) return null;
  return allRanked[index].rank || index + 1;
}

/* =========================================================
   GLOBAL CHALLENGE (₦1000, resets weekly)

   - Spans every quiz attempt, any subject — not one hardcoded
     subject.
   - ELIGIBILITY: must belong to a group with
     MIN_GROUP_SIZE_FOR_ELIGIBILITY (3+) members. No qualifying
     group, no ranking — same gate that used to apply to the old
     all-time board.
   - SCORE: mostly your own performance this week, with your best
     qualifying group's weekly average giving a small nudge —
     never the main driver.
========================================================= */


/**
 * Returns the Monday 00:00:00.000 → Sunday 23:59:59.999 bounds for
 * the week containing `date` (defaults to now), plus a display
 * label and a stable key (e.g. "2026-W29") — handy later if you
 * want to store "who won week X" records for payout tracking.
 */
function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(d);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + diffToMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setMilliseconds(-1); // rolls back to Sunday 23:59:59.999

  // Good-enough (not spec-perfect ISO) week numbering — just needs
  // to be stable and unique per calendar week for the key.
  const firstJan = new Date(weekStart.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((weekStart - firstJan) / 86400000 + firstJan.getDay() + 1) / 7,
  );

  const fmt = (dt) =>
    dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return {
    weekStart,
    weekEnd,
    weekKey: `${weekStart.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`,
    weekLabel: `${fmt(weekStart)} – ${fmt(weekEnd)}`,
  };
}

// Firestore and scheduled jobs use Africa/Lagos week boundaries, regardless
// of the student's device timezone.
function getLagosWeekBounds(date = new Date()) {
  const lagosDate = new Date(date.getTime() + 60 * 60 * 1000);
  const midnightUtc = Date.UTC(
    lagosDate.getUTCFullYear(),
    lagosDate.getUTCMonth(),
    lagosDate.getUTCDate(),
  );
  const day = new Date(midnightUtc).getUTCDay();
  const mondayUtc = midnightUtc - (day === 0 ? 6 : day - 1) * 86400000;
  const weekStart = new Date(mondayUtc - 60 * 60 * 1000);
  const weekEnd = new Date(mondayUtc + 7 * 86400000 - 60 * 60 * 1000 - 1);
  const firstJan = Date.UTC(new Date(mondayUtc).getUTCFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((mondayUtc - firstJan) / 86400000 + new Date(firstJan).getUTCDay() + 1) / 7,
  );
  const fmt = (dt) => dt.toLocaleDateString("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
  });
  return {
    weekStart,
    weekEnd,
    weekKey: `${new Date(mondayUtc).getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`,
    weekLabel: `${fmt(weekStart)} – ${fmt(weekEnd)}`,
  };
}

/**
 * The Global Challenge leaderboard for the current week. Returns
 * { top, all, weekKey, weekLabel } — `top` for display, `all` so
 * a specific user's rank can be looked up via findGlobalRank even
 * if they're outside the displayed top N.
 *
 * NOTE: this only range-filters `completedAt` (no equality filter
 * combined with it), so it does NOT need a Firestore composite
 * index — simpler than the old subject-scoped version.
 */
export async function getGlobalChallengeLeaderboard(limitCount = 15, rankUserIds = []) {
  const { weekKey, weekLabel } = getLagosWeekBounds();
  const memberKey = [...new Set(rankUserIds)].sort().join(",");
  const cacheKey = `${weekKey}:${memberKey}:${Math.min(15, limitCount)}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await getGlobalChallengeLeaderboardCallable({ limitCount: Math.min(15, limitCount) });
  const value = { ...response.data, weekLabel };
  leaderboardCache.set(cacheKey, { value, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS });
  for (const [key, entry] of leaderboardCache) {
    if (entry.expiresAt <= Date.now()) leaderboardCache.delete(key);
  }
  return value;
}
/**
 * Builds the internal leaderboard for a single group: each
 * member's average percentage across ALL their quiz attempts
 * (any subject, Practice + Purchased Quiz combined, all-time —
 * this is just "how is my squad doing", separate from the
 * time-boxed Global Challenge above).
 */
export async function getGroupLeaderboard(group, rankedMembers = []) {
  const memberIds = group.memberIds || [];
  const cacheKey = `${group.id}:${[...memberIds].sort().join(",")}`;
  const cached = groupDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const ranksByUid = new Map(rankedMembers.map((member) => [member.uid, member]));
  const memberResults = await Promise.allSettled(
    memberIds.map(async (uid) => {
      const userSnap = await getDoc(doc(db, "users", uid));

      const name = userSnap.exists()
        ? userSnap.data().name || "Student"
        : "Student";

      const rank = ranksByUid.get(uid);
      return { uid, name, rank: rank?.rank || null, attemptCount: rank?.attemptCount || 0, score: rank?.score || 0 };
    }),
  );

  const members = memberResults
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  members.sort((a, b) => {
    if (a.rank == null && b.rank == null) return 0;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });

  groupDetailsCache.set(cacheKey, { value: members, expiresAt: Date.now() + GROUP_DETAIL_CACHE_TTL_MS });
  for (const [key, entry] of groupDetailsCache) {
    if (entry.expiresAt <= Date.now()) groupDetailsCache.delete(key);
  }
  return members;
}
