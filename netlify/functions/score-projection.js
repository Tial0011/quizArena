const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { pollRecentAttemptScores } = require("../lib/challenge");

exports.handler = async () => {
  try {
    const { db, Timestamp, FieldValue } = getFirebaseAdmin();
    await pollRecentAttemptScores(db, Timestamp, FieldValue);
    return { statusCode: 200, body: "Recent challenge scores refreshed." };
  } catch (error) {
    console.error("Scheduled challenge score refresh failed:", error);
    throw error;
  }
};
