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
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   FRIEND GROUP SERVICE

   Sole reader/writer for "friendGroups" and "groupJoinRequests" —
   same pattern as purchaseService.js / attemptsService.js.

   PILOT SCOPE (this week only, per the product conversation this
   was scoped from): leaderboard is hardcoded to one subject, no
   weekly reset, no automated reward payout. All of that is
   intentional for a fast, low-risk first version — adjust
   LEADERBOARD_SUBJECT and add reset/payout logic later once this
   is proven out.

   friendGroups/{id}:
   { name, code, ownerId, ownerName, memberIds: [uid...], createdAt }

   groupJoinRequests/{id}:
   { groupId, requesterId, requesterEmail, requesterName, status: "pending"|"accepted"|"rejected", createdAt }
========================================================= */

// Change this one line next week whenu sbject scope expands.
export const LEADERBOARD_SUBJECT = "MTH 121";
const MIN_GROUP_SIZE_FOR_ELIGIBILITY = 3;
const GROUP_INFLUENCE_WEIGHT = 0.15;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 (avoid ambiguity)

function generateCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Creates a new friend group owned by the given user. Retries a
 * few times on the rare chance of a code collision.
 */
export async function createFriendGroup(ownerId, ownerName, groupName) {
  if (!ownerId || !groupName) {
    return { success: false, message: "Missing group name." };
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
 * duplicate pending requests and joining a group you're already
 * in.
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

export async function acceptJoinRequest(requestId, groupId, requesterId) {
  await updateDoc(doc(db, "groupJoinRequests", requestId), {
    status: "accepted",
  });

  await updateDoc(doc(db, "friendGroups", groupId), {
    memberIds: arrayUnion(requesterId),
  });
}

export async function rejectJoinRequest(requestId) {
  await updateDoc(doc(db, "groupJoinRequests", requestId), {
    status: "rejected",
  });
}

// Tune these two as you go — both directly control how hard the
// leaderboard is to game and how much teammates matter.// "a bit" — 15% group average, 85% individual

/**
 * GLOBAL leaderboard — every attempt across every user for
 * LEADERBOARD_SUBJECT, aggregated into a per-user average and
 * ranked. This is the reward-eligible ranking: unlike a
 * group-scoped board, it can't be gamed by inviting weak fake
 * friends into a private group, since it's computed against
 * every real student on the platform.
 *
 * TWO ELIGIBILITY/SCORING RULES on top of the raw average:
 *
 * 1. Minimum group size: a user only counts toward the global
 *    leaderboard if they belong to at least one group with
 *    MIN_GROUP_SIZE_FOR_ELIGIBILITY or more members (regardless
 *    of whether those members have attempted anything yet — this
 *    is a real-squad-size check, not an activity check). Being in
 *    zero groups, or only in groups smaller than that, means no
 *    ranking at all. This is what actually forces real recruiting
 *    rather than gaming a 1-2 person "group."
 *
 * 2. Group influence on score: once eligible, a user's ranking
 *    score is a blend of their own individual average and their
 *    group's average (mean of member averages, counting only
 *    members who have at least one attempt). If a user belongs to
 *    more than one qualifying group, their best (most favorable)
 *    blended score across those groups is used — joining more
 *    than one group should never hurt you.
 *
 * NOTE: pilot-scale implementation — fetches the full set of
 * matching attempts AND every group in one pass each, aggregating
 * client-side. Fine for a small first cohort; revisit with
 * server-side aggregation if attempt/group volume grows large
 * (see "adjust next week" scope note in the header comment above).
 *
 * Returns { top, all } — `top` is the slice for display,
 * `all` is the full ranked list so a specific user's rank can
 * be looked up even if they're outside the displayed top N.
 */
export async function getGlobalLeaderboard(limitCount = 20) {
  const attemptsSnap = await getDocs(
    query(
      collection(db, "attempts"),
      where("subjectName", "==", LEADERBOARD_SUBJECT),
    ),
  );

  const individualStats = new Map();

  attemptsSnap.forEach((docSnap) => {
    const data = docSnap.data();

    const entry = individualStats.get(data.userId) || {
      totalPercentage: 0,
      count: 0,
    };

    entry.totalPercentage += data.percentage || 0;
    entry.count++;

    individualStats.set(data.userId, entry);
  });

  function getIndividualAverage(userId) {
    const entry = individualStats.get(userId);

    if (!entry) return null;

    return entry.totalPercentage / entry.count;
  }
  const groupsSnap = await getDocs(collection(db, "friendGroups"));

  const qualifyingGroups = groupsSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }))
    .filter(
      (group) =>
        (group.memberIds || []).length >= MIN_GROUP_SIZE_FOR_ELIGIBILITY,
    );

  // Compute each qualifying group's average ONCE, reused for every
  // member's blend below rather than recomputed per-member.
  const groupsWithAverages = qualifyingGroups.map((group) => {
    const memberAverages = group.memberIds
      .map((uid) => getIndividualAverage(uid))
      .filter((avg) => avg !== null);

    const groupAverage =
      memberAverages.length > 0
        ? memberAverages.reduce((sum, avg) => sum + avg, 0) /
          memberAverages.length
        : null;

    return {
      memberIds: group.memberIds,
      groupAverage,
    };
  });
  const eligibleUserIds = new Set();

  groupsWithAverages.forEach((group) => {
    group.memberIds.forEach((uid) => {
      eligibleUserIds.add(uid);
    });
  });
  const scored = [];

  eligibleUserIds.forEach((userId) => {
    const individualAvg = getIndividualAverage(userId);

    // User has no attempts
    if (individualAvg === null) return;

    let bestBlended = null;

    groupsWithAverages.forEach((group) => {
      // User isn't in this group
      if (!group.memberIds.includes(userId)) return;

      // Nobody in this group has attempted yet
      if (group.groupAverage === null) return;

      const blended =
        individualAvg * (1 - GROUP_INFLUENCE_WEIGHT) +
        group.groupAverage * GROUP_INFLUENCE_WEIGHT;

      if (bestBlended === null || blended > bestBlended) {
        bestBlended = blended;
      }
    });

    // User wasn't in any valid scoring group
    if (bestBlended === null) return;

    scored.push({
      uid: userId,
      individualAverage: Math.round(individualAvg),
      blendedScore: bestBlended,
      attemptCount: individualStats.get(userId).count,
    });
  });

  const userDocs = await Promise.allSettled(
    scored.map((s) => getDoc(doc(db, "users", s.uid))),
  );

  const ranked = scored.map((s, index) => {
    const userResult = userDocs[index];
    const name =
      userResult.status === "fulfilled" && userResult.value.exists()
        ? userResult.value.data().name || "Student"
        : "Student";

    return {
      uid: s.uid,
      name,
      attemptCount: s.attemptCount,
      individualAverage: s.individualAverage,
      averagePercentage: Math.round(s.blendedScore), // the actual ranking/display number
    };
  });

  ranked.sort((a, b) => b.averagePercentage - a.averagePercentage);

  return {
    top: ranked.slice(0, limitCount),
    all: ranked,
  };
}

/**
 * Finds a specific user's 1-indexed rank within the FULL global
 * ranking (`all` from getGlobalLeaderboard), not just the
 * displayed top slice. Returns null if they have no qualifying
 * attempts yet.
 */
export function findGlobalRank(allRanked, userId) {
  const index = allRanked.findIndex((entry) => entry.uid === userId);
  return index === -1 ? null : index + 1;
}

/**
 * Builds the ranked leaderboard for a group: each member's
 * average percentage across their LEADERBOARD_SUBJECT attempts
 * (Practice + Purchased Quiz combined — "mode" isn't filtered,
 * subject is what matters here).
 *
 * NOTE: this queries per-member (one query per group member) since
 * Firestore's `in` operator combined with an equality filter on a
 * different field can require a composite index that may not
 * exist yet — Firestore will show a console link to create it if
 * needed the first time this runs, same as attemptsService.js.
 */
export async function getGroupLeaderboard(group) {
  const memberIds = group.memberIds || [];

  const memberResults = await Promise.allSettled(
    memberIds.map(async (uid) => {
      const [userSnap, attemptsSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDocs(
          query(
            collection(db, "attempts"),
            where("userId", "==", uid),
            where("subjectName", "==", LEADERBOARD_SUBJECT),
          ),
        ),
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
