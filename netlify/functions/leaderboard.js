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
    const top = snapshotData.top || [];
    const publicEntries = [...top, ...rankedMembers];
    const publicIds = [...new Set(publicEntries.map((entry) => entry.uid).filter(Boolean))];
    const publicUserDocs = publicIds.length
      ? await db.getAll(...publicIds.map((uid) => db.collection("users").doc(uid)))
      : [];
    const usernamesByUid = new Map(publicUserDocs.map((userDoc) => [
      userDoc.id,
      userDoc.exists && typeof userDoc.data().username === "string"
        ? userDoc.data().username.trim()
        : "",
    ]));
    const missingUsernameIds = publicIds.filter((uid) => !usernamesByUid.get(uid));
    for (let offset = 0; offset < missingUsernameIds.length; offset += 30) {
      const chunk = missingUsernameIds.slice(offset, offset + 30);
      if (!chunk.length) continue;
      const usernameDocs = await db.collection("usernames").where("uid", "in", chunk).get();
      usernameDocs.docs.forEach((usernameDoc) => {
        const usernameData = usernameDoc.data();
        if (typeof usernameData.username === "string" && usernameData.username.trim()) {
          usernamesByUid.set(usernameData.uid, usernameData.username.trim());
        }
      });
    }
    const withUsername = (entry) => {
      const publicEntry = { ...entry };
      delete publicEntry.name;
      return { ...publicEntry, username: usernamesByUid.get(entry.uid) || "Username unavailable" };
    };
    return json(200, {
      data: {
        top: top.map(withUsername),
        rankedMembers: rankedMembers.map(withUsername),
        weekKey: week.weekKey,
        updatedAt: snapshotData.computedAt?.toMillis?.() || null,
      },
    });
  } catch (error) {
    console.error("Global leaderboard request failed:", error);
    return json(500, { message: "The weekly leaderboard could not be loaded. Please try again." });
  }
};
