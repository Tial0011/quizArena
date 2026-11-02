const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { rebuildWeeklyChallengeLeaderboardSnapshot } = require("../lib/challenge");

exports.handler = async () => {
  try {
    const { db, Timestamp, FieldValue } = getFirebaseAdmin();
    await rebuildWeeklyChallengeLeaderboardSnapshot(db, Timestamp, FieldValue);
    return { statusCode: 200, body: "Leaderboard refreshed." };
  } catch (error) {
    console.error("Scheduled leaderboard refresh failed:", error);
    throw error;
  }
};
