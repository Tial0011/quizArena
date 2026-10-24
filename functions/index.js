const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

const WELCOME_QUIZ_ID = "fMszqKjA0M1cYvz9samb";

async function quoteFlutterwaveFee(amount, paymentType) {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error("Flutterwave secret key is not configured.");
  if (!Number.isInteger(amount)) {
    throw new Error("Flutterwave v3 fee quotes require a whole-naira amount.");
  }
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/fee?amount=${encodeURIComponent(amount)}&currency=NGN&payment_type=${encodeURIComponent(paymentType)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const result = await response.json();
  const chargeAmount = Number(result?.data?.charge_amount);
  const fee = Number(result?.data?.fee);
  if (
    !response.ok ||
    result?.status !== "success" ||
    !Number.isFinite(chargeAmount) ||
    !Number.isFinite(fee) ||
    chargeAmount < amount
  ) {
    throw new Error("Flutterwave fee quote failed.");
  }
  return { chargeAmount, fee };
}

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

async function writeWeeklyChallengeScore(summary) {
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function getWeeklyScoringAttempts(userId, weekStart, weekEnd) {
  const queries = [
    db.collection("attempts").where("mode", "==", "purchased"),
    db.collection("attempts").where("quizId", "==", WELCOME_QUIZ_ID),
  ].map((baseQuery) => {
    let scopedQuery = baseQuery;
    if (userId) scopedQuery = scopedQuery.where("userId", "==", userId);
    return scopedQuery
      .where("completedAt", ">=", admin.firestore.Timestamp.fromDate(weekStart))
      .where("completedAt", "<=", admin.firestore.Timestamp.fromDate(weekEnd))
      .get();
  });
  const snapshots = await Promise.all(queries);
  const uniqueAttempts = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((attemptDoc) => {
    uniqueAttempts.set(attemptDoc.id, attemptDoc);
  }));
  return [...uniqueAttempts.values()];
}

async function recomputeWeeklyChallengeScore(userId, weekStart, weekEnd, weekKey) {
  const attemptDocs = await getWeeklyScoringAttempts(userId, weekStart, weekEnd);
  if (attemptDocs.length === 0) return;
  const summary = summarizeWeeklyAttempts(userId, weekKey, attemptDocs);
  if (summary.purchasedCount > 0) await writeWeeklyChallengeScore(summary);
}

async function rebuildWeeklyChallengeLeaderboardSnapshot() {
  const { weekStart, weekEnd, weekKey } = lagosWeekBounds(new Date());
  const [projectionSnap, groupsSnap] = await Promise.all([
    db.collection("weeklyChallengeProjection").doc(weekKey).get(),
    db.collection("friendGroups").get(),
  ]);
  const groups = groupsSnap.docs
    .map((doc) => doc.data())
    .filter((group) => (group.memberIds || []).length >= 3);
  const eligibleIds = new Set(groups.flatMap((group) => group.memberIds || []));
  const stats = new Map();

  if (projectionSnap.exists && projectionSnap.data().ready === true) {
    const scoreIds = [...eligibleIds].map((uid) => `${weekKey}_${uid}`);
    for (let offset = 0; offset < scoreIds.length; offset += 30) {
      const ids = scoreIds.slice(offset, offset + 30);
      const scoreSnap = await db.collection("weeklyChallengeScores")
        .where(admin.firestore.FieldPath.documentId(), "in", ids)
        .get();
      scoreSnap.docs.forEach((scoreDoc) => {
        const score = scoreDoc.data();
        stats.set(score.userId, {
          score: Number(score.scoreBase) || 0,
          purchasedCount: Number(score.purchasedCount) || 0,
          varietyCount: Number(score.varietyCount) || Object.keys(score.quizCounts || {}).length,
          engagement: Number(score.engagement) || 0,
        });
      });
    }
  } else {
    const attempts = await getWeeklyScoringAttempts(null, weekStart, weekEnd);
    const byUser = new Map();
    attempts.forEach((attempt) => {
      const userId = attempt.data().userId;
      if (!userId) return;
      const userAttempts = byUser.get(userId) || [];
      userAttempts.push(attempt);
      byUser.set(userId, userAttempts);
    });
    byUser.forEach((userAttempts, userId) => {
      const summary = summarizeWeeklyAttempts(userId, weekKey, userAttempts);
      if (summary.purchasedCount > 0) stats.set(userId, {
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
  const priorWinnerDocs = await Promise.all(priorWeekKeys.map((key) => db.collection("weeklyWinners").doc(key).get()));
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
  // Cooldown winners may place 2nd/3rd, but never 1st, even if nearly
  // everyone else is cooling down too.
  if (ranked.length > 1 && cooldownIds.has(ranked[0].uid)) {
    const firstPlaceEligibleIndex = ranked.findIndex((entry) => !cooldownIds.has(entry.uid));
    if (firstPlaceEligibleIndex > 0) {
      [ranked[0], ranked[firstPlaceEligibleIndex]] = [ranked[firstPlaceEligibleIndex], ranked[0]];
    }
  }

  const usersById = new Map();
  for (let offset = 0; offset < ranked.length; offset += 100) {
    const chunk = ranked.slice(offset, offset + 100);
    const userDocs = await db.getAll(...chunk.map((entry) => db.collection("users").doc(entry.uid)));
    userDocs.forEach((userDoc) => usersById.set(userDoc.id, userDoc.exists ? userDoc.data().name || "Student" : "Student"));
  }

  const ranksByUid = {};
  ranked.forEach((entry, index) => {
    const visibleEntry = {
      ...entry,
      rank: index + 1,
      averagePercentage: entry.score,
      name: usersById.get(entry.uid) || "Student",
    };
    ranksByUid[entry.uid] = visibleEntry;
  });
  await db.collection("weeklyChallengeLeaderboardSnapshots").doc(weekKey).set({
    weekKey,
    top: ranked.slice(0, 15).map((entry, index) => ranksByUid[entry.uid] && ({ ...ranksByUid[entry.uid], rank: index + 1 })),
    ranksByUid,
    computedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

const leaderboardSnapshotRefreshes = new Map();
async function ensureWeeklyLeaderboardSnapshot() {
  const { weekKey } = lagosWeekBounds(new Date());
  if (!leaderboardSnapshotRefreshes.has(weekKey)) {
    const refresh = rebuildWeeklyChallengeLeaderboardSnapshot()
      .finally(() => leaderboardSnapshotRefreshes.delete(weekKey));
    leaderboardSnapshotRefreshes.set(weekKey, refresh);
  }
  await leaderboardSnapshotRefreshes.get(weekKey);
}

exports.getGlobalChallengeLeaderboard = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view the leaderboard.");
  const uid = request.auth.uid;
  const { weekKey } = lagosWeekBounds(new Date());
  let snapshot = await db.collection("weeklyChallengeLeaderboardSnapshots").doc(weekKey).get();
  if (!snapshot.exists) {
    await ensureWeeklyLeaderboardSnapshot();
    snapshot = await db.collection("weeklyChallengeLeaderboardSnapshots").doc(weekKey).get();
  }
  if (!snapshot.exists) throw new HttpsError("unavailable", "The weekly leaderboard is preparing. Please try again shortly.");

  const groups = await db.collection("friendGroups")
    .where("memberIds", "array-contains", uid)
    .limit(3)
    .get();
  const visibleIds = new Set([uid]);
  groups.docs.forEach((groupDoc) => {
    const memberIds = groupDoc.data().memberIds || [];
    if (memberIds.length >= 3) memberIds.forEach((memberId) => visibleIds.add(memberId));
  });
  const ranksByUid = snapshot.data().ranksByUid || {};
  const rankedMembers = [...visibleIds]
    .map((memberId) => ranksByUid[memberId])
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);
  const snapshotData = snapshot.data();
  return {
    top: snapshotData.top || [],
    rankedMembers,
    weekKey,
    updatedAt: snapshotData.computedAt?.toMillis?.() || null,
  };
});

exports.refreshWeeklyChallengeLeaderboard = onSchedule(
  { schedule: "0 */6 * * *", timeZone: "Africa/Lagos" },
  rebuildWeeklyChallengeLeaderboardSnapshot,
);

exports.updateWeeklyChallengeScore = onDocumentCreated("attempts/{attemptId}", async (event) => {
  const data = event.data?.data();
  if (!data?.userId || !data.completedAt) return;
  if (data.quizId !== WELCOME_QUIZ_ID && !(data.mode === "purchased" && data.quizId)) return;

  const { weekStart, weekEnd, weekKey } = lagosWeekBounds(data.completedAt.toDate());
  await recomputeWeeklyChallengeScore(data.userId, weekStart, weekEnd, weekKey);
});

// A daily rebuild backfills attempts made before the score projection was
// deployed and repairs missed event deliveries. Student pages keep using the
// legacy query until this marker confirms the week's snapshot is ready.
exports.backfillCurrentWeeklyChallengeScores = onSchedule(
  { schedule: "25 0 * * *", timeZone: "Africa/Lagos" },
  async () => {
    const { weekStart, weekEnd, weekKey } = lagosWeekBounds(new Date());
    const attemptDocs = await getWeeklyScoringAttempts(null, weekStart, weekEnd);
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
      await Promise.all(users.slice(offset, offset + 25).map(([userId, userAttempts]) =>
        {
          const summary = summarizeWeeklyAttempts(userId, weekKey, userAttempts);
          return summary.purchasedCount > 0 ? writeWeeklyChallengeScore(summary) : null;
        },
      ));
    }

    await db.collection("weeklyChallengeProjection").doc(weekKey).set({
      ready: true,
      attemptCount: attemptDocs.length,
      computedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await rebuildWeeklyChallengeLeaderboardSnapshot();
  },
);

/* Keep in step with js/student/packRank.js */
const RANKS = [
  { at: 1, title: "Quiz Arena Rookie", emoji: "🌱" },
  { at: 3, title: "Quiz Arena Scholar", emoji: "📘" },
  { at: 5, title: "Quiz Arena Topper", emoji: "🔥" },
  { at: 8, title: "Quiz Arena Legend", emoji: "👑" },
];
function rankFor(count) {
  let found = null;
  RANKS.forEach((r) => count >= r.at && (found = r));
  return found;
}

/* =========================================================
   PAYMENTS — Flutterwave purchase verification
========================================================= */
exports.verifyFlutterwavePurchase = functions.https.onCall(async (request) => {
  const { userId, txRef, transactionId } = request.data;

  // One payment can now unlock several quizzes. `quizId` is still
  // accepted so older clients keep working.
  const rawIds = Array.isArray(request.data.quizIds)
    ? request.data.quizIds
    : [request.data.quizId];
  const quizIds = [...new Set(rawIds.filter((id) => typeof id === "string" && id))];

  // Must be logged in, and can only confirm a purchase for themselves.
  if (!request.auth || request.auth.uid !== userId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Not authorized.",
    );
  }

  if (quizIds.length === 0 || quizIds.length > 50 || !txRef || !transactionId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields.",
    );
  }
  if (quizIds.includes(WELCOME_QUIZ_ID)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The free welcome quiz cannot be purchased.",
    );
  }

  // 1. Ask Flutterwave directly: did this transaction really succeed?
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  const verifyRes = await fetch(
    `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const verifyData = await verifyRes.json();

  if (
    verifyData.status !== "success" ||
    verifyData.data.status !== "successful"
  ) {
    return { success: false, message: "Payment could not be verified." };
  }

  const tx = verifyData.data;

  if (tx.tx_ref !== txRef) {
    console.log("tx_ref mismatch", {
      fromFlutterwave: tx.tx_ref,
      fromClient: txRef,
    });
    return { success: false, message: "Transaction reference mismatch." };
  }

  // The reference is minted by our own client and contains the buyer's
  // uid, so one student can't claim another student's payment.
  if (!String(tx.tx_ref).includes(userId)) {
    return { success: false, message: "Transaction reference mismatch." };
  }

  // 2. Load every quiz so we add up the REAL prices, not what the client sent.
  const quizSnaps = await Promise.all(
    quizIds.map((id) => db.collection("quizzes").doc(id).get()),
  );
  if (quizSnaps.some((snap) => !snap.exists)) {
    return { success: false, message: "One of the quizzes was not found." };
  }
  const quizzes = quizSnaps.map((snap) => ({ id: snap.id, ...snap.data() }));

  const txRecordRef = db
    .collection("flutterwaveTransactions")
    .doc(String(transactionId));

  // 3. Everything below runs in ONE Firestore transaction, so a payment
  //    is either fully applied (record + every purchase) or not at all.
  //    (Before, the "processed" marker was written first; a crash after
  //    it meant a paid-for quiz was never granted.)
  const outcome = await db.runTransaction(async (t) => {
    const txDoc = await t.get(txRecordRef);
    if (txDoc.exists) {
      return { alreadyProcessed: true, purchasedIds: txDoc.data().quizIds || [] };
    }

    const ownedSnap = await t.get(
      db
        .collection("purchases")
        .where("userId", "==", userId)
        .where("status", "==", "paid"),
    );
    const owned = new Set(ownedSnap.docs.map((d) => d.data().quizId));
    const toGrant = quizzes.filter((q) => !owned.has(q.id));

    if (toGrant.length === 0) {
      return { alreadyOwned: true, purchasedIds: [] };
    }

    const expectedNetKobo = toGrant.reduce(
      (sum, q) => sum + Math.round(Number(q.price || 0) * 100),
      0,
    );
    const expectedNet = expectedNetKobo / 100;
    const expectedProductAmount = expectedNet;
    const expectedFeeKobo = Math.round(Number(tx.app_fee || 0) * 100);
    const expectedFeeVatKobo = Math.round(expectedFeeKobo * 0.075);
    const expectedCustomerChargeKobo =
      expectedNetKobo + expectedFeeKobo + expectedFeeVatKobo;
    const actualCustomerChargeKobo = Math.round(
      Number(tx.charged_amount ?? tx.amount) * 100,
    );
    const amountSettled = Number(tx.amount_settled);
    if (
      tx.currency !== "NGN" ||
      Math.round(Number(tx.amount) * 100) !== Math.round(expectedProductAmount * 100) ||
      actualCustomerChargeKobo !== expectedCustomerChargeKobo ||
      !Number.isFinite(amountSettled) ||
      Math.round(amountSettled * 100) !== Math.round(expectedNet * 100) ||
      actualCustomerChargeKobo < Math.round(Number(tx.amount) * 100)
    ) {
      console.log("Amount/currency check failed", {
        txAmount: tx.amount,
        amountSettled: tx.amount_settled,
        txCurrency: tx.currency,
        expectedProductAmount,
        expectedNet,
      });
      return { mismatch: true };
    }

    const purchaseIds = [];
    toGrant.forEach((q) => {
      const purchaseRef = db.collection("purchases").doc();
      purchaseIds.push(purchaseRef.id);
      t.set(purchaseRef, {
        quizId: q.id,
        userId,
        purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "paid",
        txRef,
        transactionId,
      });
    });

    t.set(txRecordRef, {
      userId,
      quizIds: toGrant.map((q) => q.id),
      txRef,
      amount: tx.amount,
      amountSettled: tx.amount_settled ?? null,
      flutterwaveFee: tx.app_fee ?? null,
      paymentType: tx.payment_type ?? null,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    t.update(db.collection("users").doc(userId), {
      purchasedQuizzes: admin.firestore.FieldValue.arrayUnion(...purchaseIds),
    });

    // One personal in-app notification PER quiz, written server-side after
    // verification so it can't be spoofed. (Before, a multi-quiz pack wrote
    // a single "N quizzes unlocked" line, so the bell only ever showed one
    // entry.) To avoid a burst of N phone pushes, only the first doc sends
    // a push (with a summary); the rest are marked skipPush.
    // sendNotificationPush (below) handles delivery.
    const summary =
      toGrant.length === 1
        ? `🎉 You now own "${toGrant[0].title}"! Find it under My Quizzes.`
        : `🎉 ${toGrant.length} quizzes unlocked! Find them under My Quizzes.`;

    toGrant.forEach((q, i) => {
      const notif = {
        message: `🎉 You now own "${q.title}"! Find it under My Quizzes.`,
        createdBy: "System",
        targetUserId: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (i === 0) notif.pushMessage = summary;
      else notif.skipPush = true;
      t.set(db.collection("notifications").doc(), notif);
    });

    // Rank-up: same steps as js/student/packRank.js. Tell the student
    // when this purchase moved them up a rank.
    const before = rankFor(owned.size);
    const after = rankFor(owned.size + toGrant.length);
    if (after && (!before || after.at > before.at)) {
      t.set(db.collection("notifications").doc(), {
        message: `${after.emoji} You're now a ${after.title}! Check your dashboard.`,
        createdBy: "System",
        targetUserId: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        skipPush: true,
      });
    }

    return { purchasedIds: toGrant.map((q) => q.id) };
  });

  if (outcome.mismatch) {
    return { success: false, message: "Payment amount mismatch." };
  }
  if (outcome.alreadyOwned) {
    return {
      success: true,
      alreadyOwned: true,
      purchasedIds: [],
      message: "You already own these quizzes.",
    };
  }
  if (outcome.alreadyProcessed) {
    return {
      success: true,
      purchasedIds: outcome.purchasedIds,
      message: "Already processed.",
    };
  }
  return {
    success: true,
    purchasedIds: outcome.purchasedIds,
    message: "Purchase successful.",
  };
});

exports.quoteFlutterwavePurchase = onCall({ cors: true }, async (request) => {
  const { userId } = request.data || {};
  const quizIds = Array.isArray(request.data?.quizIds)
    ? [...new Set(request.data.quizIds.filter((id) => typeof id === "string" && id))]
    : [];
  if (!request.auth || request.auth.uid !== userId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  if (!quizIds.length || quizIds.length > 50 || quizIds.includes(WELCOME_QUIZ_ID)) {
    throw new HttpsError("invalid-argument", "Invalid quiz selection.");
  }
  const snaps = await Promise.all(quizIds.map((id) => db.collection("quizzes").doc(id).get()));
  if (snaps.some((snap) => !snap.exists)) {
    throw new HttpsError("not-found", "A selected quiz was not found.");
  }
  const netKobo = snaps.reduce(
    (sum, snap) => sum + Math.round(Number(snap.data().price || 0) * 100),
    0,
  );
  const net = netKobo / 100;
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) {
    throw new HttpsError("unavailable", "Checkout is temporarily unavailable.");
  }
  try {
    const quote = await quoteFlutterwaveFee(Math.ceil(net), "card");
    const feeKobo = Math.round(quote.fee * 100);
    const feeVatKobo = Math.round(feeKobo * 0.075);
    const customerTotalKobo = netKobo + feeKobo + feeVatKobo;
    return {
      success: true,
      net,
      quizVat: feeVatKobo / 100,
      flutterwaveFee: feeKobo / 100,
      total: customerTotalKobo / 100,
      customerTotal: customerTotalKobo / 100,
      productAmount: net,
    };
  } catch (err) {
    console.error("Flutterwave fee quote failed:", {
      message: err.message,
      cause: err.cause?.message,
    });
    throw new HttpsError(
      "unavailable",
      "Flutterwave could not return a valid fee quote. Please retry, or contact support if this continues.",
    );
  }
});

// The Physics welcome quiz is intentionally free and isn't represented by
// a purchase document. Serve only this fixed quiz to signed-in users so its
// launch doesn't depend on the paid-quiz Firestore read rules.
exports.getWelcomeQuizQuestions = onCall(
  {
    cors: ["https://quizarena.name.ng", "https://www.quizarena.name.ng"],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to start the welcome quiz.");
    }
    const snapshot = await db.collection("questions")
      .where("quizId", "==", WELCOME_QUIZ_ID)
      .get();
    return {
      questions: snapshot.docs.map((questionDoc) => ({ id: questionDoc.id, ...questionDoc.data() })),
    };
  }
);

// The student leaderboard needs only the recent first-place UIDs for its
// cooldown rule. Keep full payout records private to admins and return only
// that minimal data from this authenticated callable.
exports.getWeeklyFirstPlaceCooldowns = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to view the leaderboard.");
    }
    const currentWeek = lagosWeekBounds(new Date());
    const weekKeys = [1, 2].map((weeksAgo) => {
      const priorWeek = new Date(currentWeek.weekStart);
      priorWeek.setDate(priorWeek.getDate() - weeksAgo * 7);
      return lagosWeekBounds(priorWeek).weekKey;
    });
    const winnerDocs = await Promise.all(
      weekKeys.map((weekKey) => db.collection("weeklyWinners").doc(weekKey).get()),
    );
    return {
      userIds: winnerDocs
        .filter((winnerDoc) => winnerDoc.exists)
        .map((winnerDoc) => winnerDoc.data().firstPlaceUid)
        .filter((uid) => typeof uid === "string" && uid),
    };
  },
);

/* =========================================================
   NOTIFICATIONS — push dispatch

   Fires whenever a doc is added to "notifications" — from the
   admin Notifications tab, or automatically via
   sendNewQuizNotification() / sendWelcomeNotification() (both in
   notificationsService.js on the client). This is the ONE place
   that actually talks to FCM; the client only ever writes the
   Firestore doc and saves device tokens onto the user doc, it
   never sends a push directly.

   targetUserId on the doc decides who gets it:
   - "all"          → every student's saved tokens
   - a specific uid → just that student's saved tokens

   Reuses the same admin.initializeApp()/db already set up above
   for the payments function — Cloud Functions in the same
   deployment share one Admin SDK instance, no need for a second
   initializeApp() call (that would actually throw).
========================================================= */
const BROADCAST_TARGET = "all";

exports.sendNotificationPush = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    const data = event.data?.data();
    if (!data?.message) return;

    if (data.skipPush) return;

    const { targetUserId } = data;
    const message = data.pushMessage || (data.actionType === "startWelcomeQuiz"
      ? "Your free Physics quiz is ready. Tap to start now—no purchase needed."
      : data.message);

    const tokens = await collectTokens(targetUserId);
    if (tokens.length === 0) return;

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      // Data-only (no top-level `notification` field) is deliberate:
      // FCM auto-displays a payload that has a `notification` field
      // when the tab is backgrounded, and onBackgroundMessage() in
      // firebase-messaging-sw.js ALSO calls showNotification() for
      // it — together that's two OS notifications for one push.
      // Sending data-only means we're the only thing that ever
      // calls showNotification(), so it only shows once.
      data: {
        title: "Quiz Arena",
        body: message,
        actionType: data.actionType || "",
      },
      // Data-only messages default to normal priority, which Android's
      // Doze/App Standby is free to defer until a maintenance window --
      // that's why sends were logging as successful but not showing up
      // right away. These headers tell the push service (and, if a
      // native Android token ever ends up in here, the OS) to wake the
      // device and deliver immediately instead of batching it.
      webpush: {
        headers: { Urgency: "high" },
      },
      android: {
        priority: "high",
      },
    });

    await cleanupInvalidTokens(tokens, response, targetUserId);
  },
);

async function collectTokens(targetUserId) {
  if (targetUserId && targetUserId !== BROADCAST_TARGET) {
    const snap = await db.collection("users").doc(targetUserId).get();
    return snap.exists ? snap.data().fcmTokens || [] : [];
  }

  // Broadcast: every student's tokens, deduped (a student signed in
  // on multiple devices has one token per device).
  const snap = await db
    .collection("users")
    .where("role", "==", "student")
    .get();

  const tokens = [];
  snap.forEach((docSnap) => {
    const docTokens = docSnap.data().fcmTokens;
    if (Array.isArray(docTokens)) tokens.push(...docTokens);
  });

  return [...new Set(tokens)];
}

/**
 * Stale tokens (app uninstalled, permission revoked, browser data
 * cleared, etc.) get pruned from whichever user doc(s) they belong
 * to, so future sends stop retrying dead tokens.
 */
async function cleanupInvalidTokens(tokens, response, targetUserId) {
  const invalidTokens = [];

  response.responses.forEach((res, i) => {
    if (!res.success) {
      const code = res.error?.code;
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(tokens[i]);
      }
    }
  });

  if (invalidTokens.length === 0) return;

  if (targetUserId && targetUserId !== BROADCAST_TARGET) {
    await db
      .collection("users")
      .doc(targetUserId)
      .update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
      });
    return;
  }

  // Broadcast case: don't know upfront which student doc each dead
  // token belongs to, so scan student docs and strip out any of the
  // invalid ones each one happens to hold.
  const snap = await db
    .collection("users")
    .where("role", "==", "student")
    .get();

  const batch = db.batch();
  let hasWrites = false;

  snap.forEach((docSnap) => {
    const owned = (docSnap.data().fcmTokens || []).filter((t) =>
      invalidTokens.includes(t),
    );

    if (owned.length > 0) {
      batch.update(docSnap.ref, {
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...owned),
      });
      hasWrites = true;
    }
  });

  if (hasWrites) await batch.commit();
}

/* =========================================================
   STREAK REMINDERS — scheduled, twice a day

   Reminds students whose streak is genuinely AT RISK: their streak
   is alive (they met the goal yesterday) and they have NOT yet met
   today's quiz goal.

   Before, this looked for "any attempt yesterday but none today", so
   it knew nothing about the daily target and could not tell a
   student who had finished their quizzes from one who hadn't.
   Now it reads the same `streak` object the app writes on the user
   doc (see js/student/attemptsService.js), so:
     - a student who has met today's goal is NEVER reminded, and
     - a student who is part-way (1 of 3 done) is told how many
       quizzes are still left.

   Day boundaries are Africa/Lagos calendar days, same as the client.

   NOTE: scheduled functions need the Firebase project on the Blaze
   (pay-as-you-go) plan.
========================================================= */

/* Keep in step with dailyQuizTarget() in js/student/attemptsService.js */
function dailyQuizTarget(streakDay) {
  if (streakDay >= 15) return 5;
  if (streakDay >= 10) return 4;
  if (streakDay >= 5) return 3;
  if (streakDay >= 2) return 2;
  return 1;
}

/** "YYYY-MM-DD" for a given moment in Africa/Lagos (UTC+1, no DST). */
function lagosDayKey(date = new Date()) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDayKey(key, deltaDays) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

/**
 * Students who still owe quizzes today. Returns
 * [{ uid, streak, remaining }].
 */
async function findStreakAtRisk() {
  const today = lagosDayKey();
  const yesterday = shiftDayKey(today, -1);

  // Alive = last goal met yesterday. Anyone who met it TODAY has
  // lastQualifiedDay === today, so they are not returned here.
  const snap = await db
    .collection("users")
    .where("streak.lastQualifiedDay", "==", yesterday)
    .get();

  const atRisk = [];
  snap.forEach((docSnap) => {
    const s = docSnap.data().streak || {};
    const streak = s.count || 0;
    if (streak < 1) return;

    const target = dailyQuizTarget(streak + 1);
    const doneSoFar = s.progressDay === today ? s.progressCount || 0 : 0;
    const remaining = target - doneSoFar;

    if (remaining > 0) atRisk.push({ uid: docSnap.id, streak, remaining });
  });
  return atRisk;
}

function plural(n) {
  return `${n} quiz${n === 1 ? "" : "zes"}`;
}

async function notifyStreakAtRisk(buildMessage) {
  const students = await findStreakAtRisk();
  if (students.length === 0) return;

  // Firestore batches are capped at 500 writes.
  for (let i = 0; i < students.length; i += 450) {
    const batch = db.batch();
    students.slice(i, i + 450).forEach((st) => {
      batch.set(db.collection("notifications").doc(), {
        message: buildMessage(st),
        createdBy: "System",
        targetUserId: st.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

exports.streakReminderAfternoon = onSchedule(
  { schedule: "0 14 * * *", timeZone: "Africa/Lagos" },
  async () => {
    await notifyStreakAtRisk(
      ({ streak, remaining }) =>
        `🔥 Keep your ${streak}-day streak — finish ${plural(remaining)} today!`,
    );
  },
);

exports.streakReminderEvening = onSchedule(
  { schedule: "0 20 * * *", timeZone: "Africa/Lagos" },
  async () => {
    await notifyStreakAtRisk(
      ({ streak, remaining }) =>
        `⏰ Last call! ${plural(remaining)} to go before midnight or your ${streak}-day streak resets.`,
    );
  },
);

// Save the completed weekly prize table just after Monday starts in Lagos.
// This immutable snapshot powers payout tracking, admin history, and the
// two-week first-place cooldown on the live leaderboard.
exports.recordWeeklyChallengeWinners = onSchedule(
  { schedule: "5 0 * * 1", timeZone: "Africa/Lagos" },
  async () => {
    const nowLagos = new Date(Date.now() + 60 * 60 * 1000);
    const monday = new Date(Date.UTC(nowLagos.getUTCFullYear(), nowLagos.getUTCMonth(), nowLagos.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - 7);
    const weekStart = new Date(monday.getTime() - 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    const keyDate = new Date(monday);
    const dayOfYear = Math.floor((keyDate - new Date(Date.UTC(keyDate.getUTCFullYear(), 0, 1))) / 86400000);
    const weekNumber = Math.ceil((dayOfYear + new Date(Date.UTC(keyDate.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7);
    const weekKey = `${keyDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;

    const [attemptsSnap, groupsSnap] = await Promise.all([
      db.collection("attempts").where("completedAt", ">=", admin.firestore.Timestamp.fromDate(weekStart)).where("completedAt", "<=", admin.firestore.Timestamp.fromDate(weekEnd)).get(),
      db.collection("friendGroups").get(),
    ]);
    const stats = new Map();
    attemptsSnap.docs
      .sort((a, b) => (a.data().completedAt?.toMillis() || 0) - (b.data().completedAt?.toMillis() || 0))
      .forEach((attemptDoc) => {
        const data = attemptDoc.data();
        const entry = stats.get(data.userId) || { quizzes: new Map(), purchased: 0, engagement: 0, score: 0 };
        const percentage = data.percentage || 0;
        if (data.quizId === "fMszqKjA0M1cYvz9samb") {
          entry.score += percentage / 100;
        } else if (data.mode === "purchased" && data.quizId) {
          const count = entry.quizzes.get(data.quizId) || 0;
          entry.score += (percentage / 10) * (count === 0 ? 1 : count <= 2 ? 0.25 : 0);
          entry.quizzes.set(data.quizId, count + 1);
          entry.purchased++;
          entry.engagement++;
        }
        stats.set(data.userId, entry);
      });

    const groups = groupsSnap.docs.map((d) => d.data()).filter((g) => (g.memberIds || []).length >= 3);
    const eligible = new Set(groups.flatMap((g) => g.memberIds || []));
    const results = [];
    eligible.forEach((uid) => {
      const entry = stats.get(uid);
      if (!entry || !entry.purchased) return;
      const groupmates = new Set();
      groups.forEach((group) => {
        if ((group.memberIds || []).includes(uid)) group.memberIds.forEach((id) => id !== uid && stats.get(id)?.purchased && groupmates.add(id));
      });
      results.push({ uid, score: entry.score + Math.min(entry.quizzes.size, 8) * 3 + Math.min(groupmates.size, 4) * 5, varietyCount: entry.quizzes.size, engagement: entry.engagement, attemptCount: entry.purchased });
    });
    results.sort((a, b) => b.score - a.score || b.varietyCount - a.varietyCount || b.engagement - a.engagement);
    const priorWinnerKeys = [];
    for (const weeksAgo of [1, 2]) {
      const priorMonday = new Date(monday);
      priorMonday.setUTCDate(priorMonday.getUTCDate() - weeksAgo * 7);
      const jan1 = new Date(Date.UTC(priorMonday.getUTCFullYear(), 0, 1));
      const priorWeekNumber = Math.ceil(((priorMonday - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
      priorWinnerKeys.push(`${priorMonday.getUTCFullYear()}-W${String(priorWeekNumber).padStart(2, "0")}`);
    }
    const priorWinnerDocs = await Promise.all(priorWinnerKeys.map((key) => db.collection("weeklyWinners").doc(key).get()));
    const cooldownIds = new Set(priorWinnerDocs.filter((snap) => snap.exists).map((snap) => snap.data().firstPlaceUid).filter(Boolean));
    results.sort((a, b) => b.score - a.score || b.varietyCount - a.varietyCount || b.engagement - a.engagement);
    if (results.length > 1 && cooldownIds.has(results[0].uid)) {
      const eligibleIndex = results.findIndex((entry) => !cooldownIds.has(entry.uid));
      if (eligibleIndex > 0) [results[0], results[eligibleIndex]] = [results[eligibleIndex], results[0]];
    }
    const top = results.slice(0, 3);
    const userRefs = top.map((entry) => db.collection("users").doc(entry.uid));
    const userDocs = userRefs.length ? await db.getAll(...userRefs) : [];
    const names = new Map(userDocs.map((userDoc) => [userDoc.id, userDoc.exists ? userDoc.data().name || "Student" : "Student"]));
    const payouts = [1500, 1000, 500];
    const winners = top.map((entry, index) => ({ ...entry, score: Math.round(entry.score * 100) / 100, name: names.get(entry.uid), place: index + 1, prizeNaira: payouts[index], payoutStatus: "pending" }));
    const weeklyWinnerRef = db.collection("weeklyWinners").doc(weekKey);
    const previousRecord = await weeklyWinnerRef.get();
    if (previousRecord.exists) {
      const payoutByUid = new Map((previousRecord.data().winners || []).map((winner) => [winner.uid, winner]));
      winners.forEach((winner) => {
        const previous = payoutByUid.get(winner.uid);
        if (previous?.payoutStatus === "paid") {
          winner.payoutStatus = "paid";
          winner.paidAt = previous.paidAt;
          winner.payoutMethod = previous.payoutMethod || null;
        }
      });
    }
    await weeklyWinnerRef.set({
      weekKey,
      weekStart: admin.firestore.Timestamp.fromDate(weekStart),
      weekEnd: admin.firestore.Timestamp.fromDate(weekEnd),
      firstPlaceUid: winners[0]?.uid || null,
      winners,
      totalPrizeNaira: winners.reduce((sum, winner) => sum + winner.prizeNaira, 0),
      recordedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  },
);
