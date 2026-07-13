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

// Change this one line next week when subject scope expands.
export const LEADERBOARD_SUBJECT = "MTH 121";

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
