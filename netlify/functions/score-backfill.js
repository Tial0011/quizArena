const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { backfillCurrentWeeklyChallengeScores } = require("../lib/challenge");

exports.handler = async () => {
  try {
    const { db, Timestamp, FieldValue } = getFirebaseAdmin();
    await backfillCurrentWeeklyChallengeScores(db, Timestamp, FieldValue);
    return { statusCode: 200, body: "Weekly challenge scores backfilled." };
  } catch (error) {
    console.error("Scheduled challenge score backfill failed:", error);
    throw error;
  }
};
