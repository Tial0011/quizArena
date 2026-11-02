const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { sendAfternoonStreakReminders } = require("../lib/streakReminders");

exports.handler = async () => {
  try {
    const { db } = getFirebaseAdmin();
    await sendAfternoonStreakReminders(db);
    return { statusCode: 200, body: "Afternoon streak reminders processed." };
  } catch (error) {
    console.error("Afternoon streak reminder job failed:", error);
    throw error;
  }
};
