const WELCOME_QUIZ_ID = "odlJoarhn2atl14EpZq6";

function lagosWeekBounds(date) {
  const lagosDate = new Date(date.getTime() + 60 * 60 * 1000);
  const lagosDay = Date.UTC(
    lagosDate.getUTCFullYear(),
    lagosDate.getUTCMonth(),
    lagosDate.getUTCDate(),
  );
  const day = new Date(lagosDay).getUTCDay();
  const mondayUtc = lagosDay - (day === 0 ? 6 : day - 1) * 86400000;
  const weekStart = new Date(mondayUtc - 60 * 60 * 1000);
  const weekEnd = new Date(mondayUtc + 7 * 86400000 - 60 * 60 * 1000 - 1);
  const firstJan = Date.UTC(new Date(mondayUtc).getUTCFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((mondayUtc - firstJan) / 86400000 + new Date(firstJan).getUTCDay() + 1) / 7,
  );
  const weekKey = `${new Date(mondayUtc).getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
  return { weekStart, weekEnd, weekKey };
}

function summarizeWeeklyAttempts(userId, weekKey, attemptDocs) {
  const quizCounts = {};
  let scoreBase = 0;
  let purchasedCount = 0;
  let engagement = 0;
  const ordered = [...attemptDocs].sort((a, b) => {
    const timeDiff = (a.data().completedAt?.toMillis() || 0) - (b.data().completedAt?.toMillis() || 0);
    return timeDiff || a.id.localeCompare(b.id);
  });

  ordered.forEach((attemptDoc) => {
    const data = attemptDoc.data();
    const percentage = Number(data.percentage) || 0;
    if (data.quizId === WELCOME_QUIZ_ID) {
      scoreBase += percentage / 100;
    } else if (data.mode === "purchased" && data.quizId) {
      const prior = quizCounts[data.quizId] || 0;
      scoreBase += (percentage / 10) * (prior === 0 ? 1 : prior <= 2 ? 0.25 : 0);
      quizCounts[data.quizId] = prior + 1;
      purchasedCount += 1;
      engagement += 1;
    }
  });

  const latest = ordered[ordered.length - 1];
  return {
    userId,
    weekKey,
    scoreBase,
    purchasedCount,
    quizCounts,
    varietyCount: Object.keys(quizCounts).length,
    engagement,
    sourceAttemptCount: attemptDocs.length,
    lastAttemptAt: latest?.data().completedAt || null,
    lastAttemptId: latest?.id || "",
  };
}

async function getWeeklyScoringAttempts(db, Timestamp, userId, weekStart, weekEnd) {
  const queries = [
    db.collection("attempts").where("mode", "==", "purchased"),
    db.collection("attempts").where("quizId", "==", WELCOME_QUIZ_ID),
  ].map((baseQuery) => {
    let scopedQuery = baseQuery;
    if (userId) scopedQuery = scopedQuery.where("userId", "==", userId);
    return scopedQuery
      .where("completedAt", ">=", Timestamp.fromDate(weekStart))
      .where("completedAt", "<=", Timestamp.fromDate(weekEnd))
      .get();
  });
  const snapshots = await Promise.all(queries);
  const uniqueAttempts = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((attemptDoc) => {
    uniqueAttempts.set(attemptDoc.id, attemptDoc);
  }));
  return [...uniqueAttempts.values()];
}

async function writeWeeklyChallengeScore(db, FieldValue, summary) {
  const scoreRef = db.collection("weeklyChallengeScores").doc(`${summary.weekKey}_${summary.userId}`);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(scoreRef);
    const current = existing.exists ? existing.data() : null;
    if (current && current.sourceAttemptCount > summary.sourceAttemptCount) return;
    if (
      current &&
      current.sourceAttemptCount === summary.sourceAttemptCount &&
      current.scoreBase === summary.scoreBase &&
      current.purchasedCount === summary.purchasedCount &&
      current.varietyCount === summary.varietyCount &&
      current.engagement === summary.engagement &&
      JSON.stringify(current.quizCounts || {}) === JSON.stringify(summary.quizCounts)
    ) return;

    transaction.set(scoreRef, {
      ...summary,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function recomputeWeeklyChallengeScore(db, Timestamp, FieldValue, userId, week) {
  const attemptDocs = await getWeeklyScoringAttempts(
    db,
    Timestamp,
    userId,
    week.weekStart,
    week.weekEnd,
  );
  if (!attemptDocs.length) return;
  const summary = summarizeWeeklyAttempts(userId, week.weekKey, attemptDocs);
  if (summary.purchasedCount > 0) {
    await writeWeeklyChallengeScore(db, FieldValue, summary);
  }
}

async function pollRecentAttemptScores(db, Timestamp, FieldValue, now = new Date()) {
  const week = lagosWeekBounds(now);
  const recentStart = new Date(now.getTime() - 15 * 60 * 1000);
  const recentAttempts = await db.collection("attempts")
    .where("completedAt", ">=", Timestamp.fromDate(recentStart))
    .where("completedAt", "<=", Timestamp.fromDate(now))
    .get();
  const userIds = new Set();
  recentAttempts.docs.forEach((attemptDoc) => {
    const data = attemptDoc.data();
    if (data.userId && (
      data.mode === "purchased" ||
      data.quizId === WELCOME_QUIZ_ID
    )) userIds.add(data.userId);
  });
  await Promise.all([...userIds].map((userId) =>
    recomputeWeeklyChallengeScore(db, Timestamp, FieldValue, userId, week),
  ));
}

async function rebuildWeeklyChallengeLeaderboardSnapshot(
  db,
  Timestamp,
  FieldValue,
  now = new Date(),
) {
  const week = lagosWeekBounds(now);
  const { weekStart, weekEnd, weekKey } = week;
  const groupsSnap = await db.collection("friendGroups").get();
  const groups = groupsSnap.docs
    .map((groupDoc) => ({ ...groupDoc.data(), groupId: groupDoc.id }))
    .filter((group) => (group.memberIds || []).length >= 3);
  const eligibilityByUid = new Map();
  groups.forEach((group) => {
    (group.memberIds || []).forEach((uid) => {
      const eligibleAt = group.createdAt?.toMillis?.() || 0;
      const previous = eligibilityByUid.get(uid);
      if (previous === undefined || eligibleAt < previous) eligibilityByUid.set(uid, eligibleAt);
    });
  });
  const eligibleIds = new Set(eligibilityByUid.keys());
  const stats = new Map();
  const eligibleUsers = [...eligibilityByUid.entries()];
  for (let offset = 0; offset < eligibleUsers.length; offset += 25) {
    const batch = eligibleUsers.slice(offset, offset + 25);
    const attemptSets = await Promise.all(batch.map(async ([uid, eligibleAt]) => {
      const attempts = await getWeeklyScoringAttempts(db, Timestamp, uid, weekStart, weekEnd);
      return [uid, attempts.filter((attempt) => {
        const completedAt = attempt.data().completedAt?.toMillis?.() || 0;
        return completedAt >= eligibleAt;
      })];
    }));
    attemptSets.forEach(([uid, attempts]) => {
      if (!attempts.length) return;
      const summary = summarizeWeeklyAttempts(uid, weekKey, attempts);
      if (summary.purchasedCount > 0) stats.set(uid, {
        score: summary.scoreBase,
        purchasedCount: summary.purchasedCount,
        varietyCount: summary.varietyCount,
        engagement: summary.engagement,
      });
    });
  }

  const groupmatesByUid = new Map();
  groups.forEach((group) => {
    const activeMembers = (group.memberIds || []).filter((uid) => (stats.get(uid)?.purchasedCount || 0) > 0);
    activeMembers.forEach((uid) => {
      const groupmates = groupmatesByUid.get(uid) || new Set();
      activeMembers.forEach((otherUid) => { if (otherUid !== uid) groupmates.add(otherUid); });
      groupmatesByUid.set(uid, groupmates);
    });
  });

  const priorWeekKeys = [1, 2].map((weeksAgo) => {
    const priorDate = new Date(weekStart);
    priorDate.setUTCDate(priorDate.getUTCDate() - weeksAgo * 7);
    return lagosWeekBounds(priorDate).weekKey;
  });
  const priorWinnerDocs = await Promise.all(
    priorWeekKeys.map((key) => db.collection("weeklyWinners").doc(key).get()),
  );
  const cooldownIds = new Set(priorWinnerDocs
    .filter((winner) => winner.exists)
    .map((winner) => winner.data().firstPlaceUid)
    .filter(Boolean));

  const ranked = [];
  eligibleIds.forEach((uid) => {
    const entry = stats.get(uid);
    if (!entry || !entry.purchasedCount) return;
    const score = entry.score
      + Math.min(entry.varietyCount, 8) * 3
      + Math.min((groupmatesByUid.get(uid) || new Set()).size, 4) * 5;
    ranked.push({
      uid,
      score: Math.round(score * 100) / 100,
      attemptCount: entry.purchasedCount,
      varietyCount: entry.varietyCount,
      engagement: entry.engagement,
    });
  });
  ranked.sort((a, b) => b.score - a.score
    || b.varietyCount - a.varietyCount || b.engagement - a.engagement);
  if (ranked.length > 1 && cooldownIds.has(ranked[0].uid)) {
    const firstPlaceEligibleIndex = ranked.findIndex((entry) => !cooldownIds.has(entry.uid));
    if (firstPlaceEligibleIndex > 0) {
      [ranked[0], ranked[firstPlaceEligibleIndex]] = [ranked[firstPlaceEligibleIndex], ranked[0]];
    }
  }

  const usernamesById = new Map();
  for (let offset = 0; offset < ranked.length; offset += 100) {
    const chunk = ranked.slice(offset, offset + 100);
    const userDocs = await db.getAll(...chunk.map((entry) => db.collection("users").doc(entry.uid)));
    userDocs.forEach((userDoc) => {
      usernamesById.set(
        userDoc.id,
        userDoc.exists && typeof userDoc.data().username === "string"
          ? userDoc.data().username.trim()
          : "",
      );
    });
  }

  const ranksByUid = {};
  ranked.forEach((entry, index) => {
    ranksByUid[entry.uid] = {
      ...entry,
      rank: index + 1,
      averagePercentage: entry.score,
      username: usernamesById.get(entry.uid) || "",
    };
  });
  await db.collection("weeklyChallengeLeaderboardSnapshots").doc(weekKey).set({
    weekKey,
    top: ranked.slice(0, 15).map((entry, index) => ({
      ...ranksByUid[entry.uid],
      rank: index + 1,
    })),
    ranksByUid,
    computedAt: FieldValue.serverTimestamp(),
  });
  return week;
}

async function ensureWeeklyLeaderboardSnapshot(db, Timestamp, FieldValue, now = new Date()) {
  const week = lagosWeekBounds(now);
  const snapshotRef = db.collection("weeklyChallengeLeaderboardSnapshots").doc(week.weekKey);
  let snapshot = await snapshotRef.get();
  if (!snapshot.exists) {
    await rebuildWeeklyChallengeLeaderboardSnapshot(db, Timestamp, FieldValue, now);
    snapshot = await snapshotRef.get();
  }
  return snapshot;
}

async function backfillCurrentWeeklyChallengeScores(db, Timestamp, FieldValue, now = new Date()) {
  const week = lagosWeekBounds(now);
  const attemptDocs = await getWeeklyScoringAttempts(
    db,
    Timestamp,
    null,
    week.weekStart,
    week.weekEnd,
  );
  const attemptsByUser = new Map();
  attemptDocs.forEach((attemptDoc) => {
    const userId = attemptDoc.data().userId;
    if (!userId) return;
    const userAttempts = attemptsByUser.get(userId) || [];
    userAttempts.push(attemptDoc);
    attemptsByUser.set(userId, userAttempts);
  });

  const users = [...attemptsByUser];
  for (let offset = 0; offset < users.length; offset += 25) {
    await Promise.all(users.slice(offset, offset + 25).map(([userId, userAttempts]) => {
      const summary = summarizeWeeklyAttempts(userId, week.weekKey, userAttempts);
      return summary.purchasedCount > 0
        ? writeWeeklyChallengeScore(db, FieldValue, summary)
        : null;
    }));
  }

  await db.collection("weeklyChallengeProjection").doc(week.weekKey).set({
    ready: true,
    attemptCount: attemptDocs.length,
    computedAt: FieldValue.serverTimestamp(),
  });
  await rebuildWeeklyChallengeLeaderboardSnapshot(db, Timestamp, FieldValue, now);
}

module.exports = {
  backfillCurrentWeeklyChallengeScores,
  ensureWeeklyLeaderboardSnapshot,
  getWeeklyScoringAttempts,
  lagosWeekBounds,
  pollRecentAttemptScores,
  rebuildWeeklyChallengeLeaderboardSnapshot,
  summarizeWeeklyAttempts,
};
