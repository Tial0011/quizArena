const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { sendEveningStreakReminders } = require("../lib/streakReminders");

exports.handler = async () => {
  try {
    const { db } = getFirebaseAdmin();
    await sendEveningStreakReminders(db);
    return { statusCode: 200, body: "Evening streak reminders processed." };
  } catch (error) {
    console.error("Evening streak reminder job failed:", error);
    throw error;
  }
};
