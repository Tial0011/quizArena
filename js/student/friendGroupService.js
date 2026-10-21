import { db } from "../firebase/config.js";
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
  Timestamp,
  documentId,
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

const MIN_GROUP_SIZE_FOR_ELIGIBILITY = 3;
const MAX_GROUPS_OWNED = 1;
const MAX_GROUPS_JOINED = 3;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 (avoid ambiguity)

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

  if (group.memberIds.includes(requesterId)) {
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

  const snapshot = await getDocs(
    query(
      collection(db, "friendGroups"),
      where("memberIds", "array-contains", userId),
    ),
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
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

  await updateDoc(doc(db, "groupJoinRequests", requestId), {
    status: "accepted",
  });

  await updateDoc(doc(db, "friendGroups", groupId), {
    memberIds: arrayUnion(requesterId),
  });

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
  const { weekStart, weekEnd, weekKey, weekLabel } = getLagosWeekBounds();
  const projection = await getDoc(doc(db, "weeklyChallengeProjection", weekKey));
  const useProjection = projection.exists() && projection.data().ready === true;
  const [attemptsSnap, groupsSnap] = await Promise.all([
    useProjection
      ? Promise.resolve(null)
      : getDocs(query(
          collection(db, "attempts"),
          where("completedAt", ">=", Timestamp.fromDate(weekStart)),
          where("completedAt", "<=", Timestamp.fromDate(weekEnd)),
        )),
    getDocs(collection(db, "friendGroups")),
  ]);

  let scoreSnapshots = [];
  if (useProjection) {
    const eligibleIds = new Set();
    groupsSnap.forEach((groupDoc) => {
      const group = groupDoc.data();
      if ((group.memberIds || []).length >= MIN_GROUP_SIZE_FOR_ELIGIBILITY) {
        (group.memberIds || []).forEach((uid) => eligibleIds.add(uid));
      }
    });
    const scoreIds = [...eligibleIds].map((uid) => `${weekKey}_${uid}`);
    const scoreQueries = [];
    for (let offset = 0; offset < scoreIds.length; offset += 30) {
      scoreQueries.push(getDocs(query(
        collection(db, "weeklyChallengeScores"),
        where(documentId(), "in", scoreIds.slice(offset, offset + 30)),
      )));
    }
    scoreSnapshots = await Promise.all(scoreQueries);
  }

  const stats = new Map();
  if (useProjection) {
    scoreSnapshots.forEach((snapshot) => snapshot.forEach((scoreDoc) => {
      const scoreData = scoreDoc.data();
      stats.set(scoreData.userId, {
        quizCounts: new Map(Object.entries(scoreData.quizCounts || {})),
        purchasedCount: scoreData.purchasedCount || 0,
        engagement: scoreData.engagement || 0,
        score: scoreData.scoreBase || 0,
      });
    }));
  } else {
    const welcomeQuizId = "fMszqKjA0M1cYvz9samb";
    const orderedAttempts = attemptsSnap.docs
      .map((attemptDoc) => ({ data: attemptDoc.data(), id: attemptDoc.id }))
      .sort((a, b) => (a.data.completedAt?.toMillis?.() || 0) - (b.data.completedAt?.toMillis?.() || 0) || a.id.localeCompare(b.id));
    orderedAttempts.forEach(({ data }) => {
      const entry = stats.get(data.userId) || { quizCounts: new Map(), purchasedCount: 0, engagement: 0, score: 0 };
      const percentage = data.percentage || 0;
      if (data.quizId === welcomeQuizId) {
        entry.score += (percentage / 10) * 0.1;
      } else if (data.mode === "purchased" && data.quizId) {
        const prior = entry.quizCounts.get(data.quizId) || 0;
        const multiplier = prior === 0 ? 1 : prior <= 2 ? 0.25 : 0;
        entry.quizCounts.set(data.quizId, prior + 1);
        entry.purchasedCount++;
        entry.engagement++;
        entry.score += (percentage / 10) * multiplier;
      }
      stats.set(data.userId, entry);
    });
  }

  const qualifyingGroups = groupsSnap.docs
    .map((groupDoc) => ({ id: groupDoc.id, ...groupDoc.data() }))
    .filter((group) => (group.memberIds || []).length >= MIN_GROUP_SIZE_FOR_ELIGIBILITY);
  const eligibleIds = new Set(qualifyingGroups.flatMap((group) => group.memberIds || []));
  const groupmatesByUid = new Map();
  qualifyingGroups.forEach((group) => {
    const activeMembers = (group.memberIds || []).filter((uid) => (stats.get(uid)?.purchasedCount || 0) > 0);
    activeMembers.forEach((uid) => {
      const groupmates = groupmatesByUid.get(uid) || new Set();
      activeMembers.forEach((memberId) => memberId !== uid && groupmates.add(memberId));
      groupmatesByUid.set(uid, groupmates);
    });
  });
  const scored = [];

  eligibleIds.forEach((uid) => {
    const entry = stats.get(uid);
    if (!entry || entry.purchasedCount === 0) return;
    const varietyCount = entry.quizCounts.size;
    const groupmates = groupmatesByUid.get(uid) || new Set();
    const score = entry.score + Math.min(varietyCount, 8) * 3 + Math.min(groupmates.size, 4) * 5;
    scored.push({ uid, attemptCount: entry.purchasedCount, varietyCount, engagement: entry.engagement, score });
  });

  const ranked = scored.map((entry) => {
    const score = Math.round(entry.score * 100) / 100;
    return { ...entry, score, averagePercentage: score };
  });
  ranked.sort((a, b) => b.score - a.score || b.varietyCount - a.varietyCount || b.engagement - a.engagement);

  const recentWinnerIds = new Set();
  for (const weeksAgo of [1, 2]) {
    const priorWeek = new Date(weekStart);
    priorWeek.setDate(priorWeek.getDate() - weeksAgo * 7);
    const priorKey = getLagosWeekBounds(priorWeek).weekKey;
    const winnerDoc = await getDoc(doc(db, "weeklyWinners", priorKey));
    if (winnerDoc.exists() && winnerDoc.data().firstPlaceUid) recentWinnerIds.add(winnerDoc.data().firstPlaceUid);
  }
  ranked.sort((a, b) => Number(recentWinnerIds.has(a.uid)) - Number(recentWinnerIds.has(b.uid)) || b.score - a.score || b.varietyCount - a.varietyCount || b.engagement - a.engagement);

  const requestedIds = new Set(rankUserIds);
  const topEntries = ranked.slice(0, limitCount).map((entry, index) => ({ ...entry, rank: index + 1 }));
  const requestedEntries = ranked
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
    .filter((entry) => requestedIds.has(entry.uid));
  const profileIds = [...new Set([
    ...topEntries.map((entry) => entry.uid),
    ...requestedEntries.map((entry) => entry.uid),
  ])];
  const userBatches = [];
  for (let offset = 0; offset < profileIds.length; offset += 30) {
    const ids = profileIds.slice(offset, offset + 30);
    userBatches.push(getDocs(query(collection(db, "users"), where(documentId(), "in", ids))));
  }
  const namesByUid = new Map();
  (await Promise.all(userBatches)).forEach((snapshot) =>
    snapshot.forEach((userDoc) => namesByUid.set(userDoc.id, userDoc.data().name || "Student")),
  );
  const addName = (entry) => ({ ...entry, name: namesByUid.get(entry.uid) || "Student" });

  return {
    top: topEntries.map(addName),
    rankedMembers: requestedEntries.map(addName),
    weekKey,
    weekLabel,
  };
}
/**
 * Builds the internal leaderboard for a single group: each
 * member's average percentage across ALL their quiz attempts
 * (any subject, Practice + Purchased Quiz combined, all-time —
 * this is just "how is my squad doing", separate from the
 * time-boxed Global Challenge above).
 */
export async function getGroupLeaderboard(group) {
  const memberIds = group.memberIds || [];

  const memberResults = await Promise.allSettled(
    memberIds.map(async (uid) => {
      const [userSnap, attemptsSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDocs(query(collection(db, "attempts"), where("userId", "==", uid))),
      ]);

      const name = userSnap.exists()
        ? userSnap.data().name || "Student"
        : "Student";

      const percentages = attemptsSnap.docs.map(
        (d) => d.data().percentage || 0,
      );
      const attemptCount = percentages.length;
      const averagePercentage =
        attemptCount > 0
          ? Math.round(
              percentages.reduce((sum, p) => sum + p, 0) / attemptCount,
            )
          : 0;

      return { uid, name, attemptCount, averagePercentage };
    }),
  );

  const members = memberResults
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  // Members with zero attempts sort to the bottom, not the top —
  // an average of 0 shouldn't outrank someone who's actually
  // attempted and scored low.
  members.sort((a, b) => {
    if (a.attemptCount === 0 && b.attemptCount === 0) return 0;
    if (a.attemptCount === 0) return 1;
    if (b.attemptCount === 0) return -1;
    return b.averagePercentage - a.averagePercentage;
  });

  return members;
}
