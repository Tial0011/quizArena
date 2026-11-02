const { FieldValue } = require("firebase-admin/firestore");

function lagosDayKey(date = new Date()) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDayKey(key, deltaDays) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + deltaDays)).toISOString().slice(0, 10);
}

function dailyQuizTarget(streakDay) {
  if (streakDay >= 15) return 5;
  if (streakDay >= 10) return 4;
  if (streakDay >= 5) return 3;
  if (streakDay >= 2) return 2;
  return 1;
}

function plural(count) {
  return `${count} quiz${count === 1 ? "" : "zes"}`;
}

async function findStreakAtRisk(db, now = new Date()) {
  const today = lagosDayKey(now);
  const yesterday = shiftDayKey(today, -1);
  const users = await db.collection("users")
    .where("streak.lastQualifiedDay", "==", yesterday)
    .get();

  const atRisk = [];
  users.forEach((user) => {
    const streakData = user.data().streak || {};
    const streak = streakData.count || 0;
    if (streak < 1) return;
    const target = dailyQuizTarget(streak + 1);
    const done = streakData.progressDay === today ? streakData.progressCount || 0 : 0;
    if (target > done) atRisk.push({ uid: user.id, streak, remaining: target - done });
  });
  return atRisk;
}

async function notifyStreakAtRisk(db, buildMessage, now = new Date()) {
  const students = await findStreakAtRisk(db, now);
  for (let offset = 0; offset < students.length; offset += 450) {
    const batch = db.batch();
    students.slice(offset, offset + 450).forEach((student) => {
      batch.set(db.collection("notifications").doc(), {
        message: buildMessage(student),
        createdBy: "System",
        targetUserId: student.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

async function sendAfternoonStreakReminders(db, now) {
  await notifyStreakAtRisk(
    db,
    ({ streak, remaining }) =>
      `🔥 Keep your ${streak}-day streak — finish ${plural(remaining)} today!`,
    now,
  );
}

async function sendEveningStreakReminders(db, now) {
  await notifyStreakAtRisk(
    db,
    ({ streak, remaining }) =>
      `⏰ Last call! ${plural(remaining)} to go before midnight or your ${streak}-day streak resets.`,
    now,
  );
}

module.exports = {
  sendAfternoonStreakReminders,
  sendEveningStreakReminders,
};
