const { authenticate, json, methodNotAllowed } = require("../lib/http");
const {
  ensureWeeklyLeaderboardSnapshot,
  lagosWeekBounds,
  rebuildWeeklyChallengeLeaderboardSnapshot,
} = require("../lib/challenge");

exports.handler = async (event) => {
  const methodResponse = methodNotAllowed(event);
  if (methodResponse) return methodResponse;

  const authentication = await authenticate(event);
  if (authentication.error) return authentication.error;

  let requestBody;
  try {
    requestBody = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { message: "Invalid request body." });
  }

  const refreshSnapshot = requestBody?.refreshSnapshot === true;
  if (refreshSnapshot && authentication.user.email !== "admin@test.com") {
    return json(403, { message: "Only administrators can refresh the leaderboard snapshot." });
  }

  try {
    const { db, Timestamp, FieldValue } = authentication.admin;
    const now = new Date();
    const week = lagosWeekBounds(now);
    let snapshot;
    if (refreshSnapshot) {
      await rebuildWeeklyChallengeLeaderboardSnapshot(db, Timestamp, FieldValue, now);
      snapshot = await db.collection("weeklyChallengeLeaderboardSnapshots").doc(week.weekKey).get();
    } else {
      snapshot = await ensureWeeklyLeaderboardSnapshot(db, Timestamp, FieldValue, now);
    }
    if (!snapshot.exists) {
      return json(503, { message: "The weekly leaderboard is preparing. Please try again shortly." });
    }

    const groups = await db.collection("friendGroups")
      .where("memberIds", "array-contains", authentication.user.uid)
      .limit(3)
      .get();
    const visibleIds = new Set([authentication.user.uid]);
    groups.docs.forEach((groupDoc) => {
      const memberIds = groupDoc.data().memberIds || [];
      if (memberIds.length >= 3) memberIds.forEach((memberId) => visibleIds.add(memberId));
    });

    const snapshotData = snapshot.data();
    const ranksByUid = snapshotData.ranksByUid || {};
    const rankedMembers = [...visibleIds]
      .map((memberId) => ranksByUid[memberId])
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank);
    return json(200, {
      data: {
        top: snapshotData.top || [],
        rankedMembers,
        weekKey: week.weekKey,
        updatedAt: snapshotData.computedAt?.toMillis?.() || null,
      },
    });
  } catch (error) {
    console.error("Global leaderboard request failed:", error);
    return json(500, { message: "The weekly leaderboard could not be loaded. Please try again." });
  }
};
