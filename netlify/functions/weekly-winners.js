const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { recordWeeklyChallengeWinners } = require("../lib/weeklyWinners");

exports.handler = async () => {
  try {
    const { db, Timestamp, FieldValue } = getFirebaseAdmin();
    await recordWeeklyChallengeWinners(db, Timestamp, FieldValue);
    return { statusCode: 200, body: "Weekly challenge winners recorded." };
  } catch (error) {
    console.error("Weekly winner job failed:", error);
    throw error;
  }
};
