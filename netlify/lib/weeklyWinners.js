const WELCOME_QUIZ_ID = "odlJoarhn2atl14EpZq6";

function priorWeekKey(monday, weeksAgo) {
  const date = new Date(monday);
  date.setUTCDate(date.getUTCDate() - weeksAgo * 7);
  const jan1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((date - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function getPreviousWeekKey(now = new Date()) {
  const nowLagos = new Date(now.getTime() + 60 * 60 * 1000);
  const monday = new Date(Date.UTC(
    nowLagos.getUTCFullYear(),
    nowLagos.getUTCMonth(),
    nowLagos.getUTCDate(),
  ));
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday - 7);
  return priorWeekKey(monday, 0);
}

async function recordWeeklyChallengeWinners(db, Timestamp, FieldValue, now = new Date()) {
  const nowLagos = new Date(now.getTime() + 60 * 60 * 1000);
  const monday = new Date(Date.UTC(
    nowLagos.getUTCFullYear(),
    nowLagos.getUTCMonth(),
    nowLagos.getUTCDate(),
  ));
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday - 7);
  const weekStart = new Date(monday.getTime() - 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  const weekKey = priorWeekKey(monday, 0);

  const [attemptsSnapshot, groupsSnapshot] = await Promise.all([
    db.collection("attempts")
      .where("completedAt", ">=", Timestamp.fromDate(weekStart))
      .where("completedAt", "<=", Timestamp.fromDate(weekEnd))
      .get(),
    db.collection("friendGroups").get(),
  ]);
  const groups = groupsSnapshot.docs
    .map((group) => group.data())
    .filter((group) => (group.memberIds || []).length >= 3);
  const eligibleAtByUid = new Map();
  groups.forEach((group) => {
    const createdAt = group.createdAt?.toMillis?.() || 0;
    (group.memberIds || []).forEach((uid) => {
      const previous = eligibleAtByUid.get(uid);
      if (previous === undefined || createdAt < previous) eligibleAtByUid.set(uid, createdAt);
    });
  });

  const stats = new Map();
  attemptsSnapshot.docs
    .sort((a, b) => (a.data().completedAt?.toMillis() || 0) - (b.data().completedAt?.toMillis() || 0))
    .forEach((attemptDoc) => {
      const data = attemptDoc.data();
      const eligibleAt = eligibleAtByUid.get(data.userId);
      const completedAt = data.completedAt?.toMillis?.() || 0;
      if (eligibleAt === undefined || !eligibleAt || completedAt < eligibleAt) return;
      const entry = stats.get(data.userId) || {
        quizzes: new Map(),
        purchased: 0,
        engagement: 0,
        score: 0,
      };
      const percentage = data.percentage || 0;
      if (data.quizId === WELCOME_QUIZ_ID) {
        entry.score += percentage / 100;
      } else if (data.mode === "purchased" && data.quizId) {
        const prior = entry.quizzes.get(data.quizId) || 0;
        entry.score += (percentage / 10) * (prior === 0 ? 1 : prior <= 2 ? 0.25 : 0);
        entry.quizzes.set(data.quizId, prior + 1);
        entry.purchased += 1;
        entry.engagement += 1;
      }
      stats.set(data.userId, entry);
    });

  const eligibleIds = new Set(groups.flatMap((group) => group.memberIds || []));
  const results = [];
  eligibleIds.forEach((uid) => {
    const entry = stats.get(uid);
    if (!entry || !entry.purchased) return;
    const groupmates = new Set();
    groups.forEach((group) => {
      if (!(group.memberIds || []).includes(uid)) return;
      group.memberIds.forEach((memberId) => {
        if (memberId !== uid && stats.get(memberId)?.purchased) groupmates.add(memberId);
      });
    });
    results.push({
      uid,
      score: entry.score + Math.min(entry.quizzes.size, 8) * 3 + Math.min(groupmates.size, 4) * 5,
      varietyCount: entry.quizzes.size,
      engagement: entry.engagement,
      attemptCount: entry.purchased,
    });
  });
  results.sort((a, b) => b.score - a.score
    || b.varietyCount - a.varietyCount || b.engagement - a.engagement);

  const priorWinnerDocs = await Promise.all(
    [1, 2].map((weeksAgo) => db.collection("weeklyWinners").doc(priorWeekKey(monday, weeksAgo)).get()),
  );
  const cooldownIds = new Set(priorWinnerDocs
    .filter((winner) => winner.exists)
    .map((winner) => winner.data().firstPlaceUid)
    .filter(Boolean));
  if (results.length > 1 && cooldownIds.has(results[0].uid)) {
    const eligibleIndex = results.findIndex((entry) => !cooldownIds.has(entry.uid));
    if (eligibleIndex > 0) [results[0], results[eligibleIndex]] = [results[eligibleIndex], results[0]];
  }

  const top = results.slice(0, 3);
  const userRefs = top.map((entry) => db.collection("users").doc(entry.uid));
  const userDocs = userRefs.length ? await db.getAll(...userRefs) : [];
  const profilesById = new Map(userDocs.map((userDoc) => [
    userDoc.id,
    userDoc.exists ? userDoc.data() : {},
  ]));
  const missingUsernameIds = top
    .map((entry) => entry.uid)
    .filter((uid) => !profilesById.get(uid)?.username);
  for (let offset = 0; offset < missingUsernameIds.length; offset += 30) {
    const chunk = missingUsernameIds.slice(offset, offset + 30);
    const usernameDocs = await db.collection("usernames").where("uid", "in", chunk).get();
    usernameDocs.docs.forEach((usernameDoc) => {
      const data = usernameDoc.data();
      const profile = profilesById.get(data.uid) || {};
      if (typeof data.username === "string" && data.username.trim()) {
        profilesById.set(data.uid, { ...profile, username: data.username.trim() });
      }
    });
  }
  const payouts = [1500, 1000, 500];
  const winners = top.map((entry, index) => ({
    ...entry,
    score: Math.round(entry.score * 100) / 100,
    name: profilesById.get(entry.uid)?.name || "Student",
    username: profilesById.get(entry.uid)?.username || "",
    place: index + 1,
    prizeNaira: payouts[index],
    payoutStatus: "pending",
  }));
  const weeklyWinnerRef = db.collection("weeklyWinners").doc(weekKey);
  const previousRecord = await weeklyWinnerRef.get();
  if (previousRecord.exists) {
    const payoutByUid = new Map(
      (previousRecord.data().winners || []).map((winner) => [winner.uid, winner]),
    );
    winners.forEach((winner) => {
      const previous = payoutByUid.get(winner.uid);
      if (previous?.payoutStatus !== "paid") return;
      winner.payoutStatus = "paid";
      winner.paidAt = previous.paidAt;
      winner.payoutMethod = previous.payoutMethod || null;
    });
  }

  await weeklyWinnerRef.set({
    weekKey,
    weekStart: Timestamp.fromDate(weekStart),
    weekEnd: Timestamp.fromDate(weekEnd),
    firstPlaceUid: winners[0]?.uid || null,
    winners,
    totalPrizeNaira: winners.reduce((sum, winner) => sum + winner.prizeNaira, 0),
    recordedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

module.exports = { getPreviousWeekKey, recordWeeklyChallengeWinners };
