const functions = require("firebase-functions");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

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

    const expected = toGrant.reduce((sum, q) => sum + Number(q.price || 0), 0);
    if (tx.currency !== "NGN" || tx.amount < expected) {
      console.log("Amount/currency check failed", {
        txAmount: tx.amount,
        txCurrency: tx.currency,
        expected,
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
    const message = data.pushMessage || data.message;

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

   Targets students whose streak is genuinely AT RISK: they had an
   attempt yesterday (Africa/Lagos calendar day — same day boundary
   the client uses in attemptsService.js/getStreakInfo, not a
   rolling 24-hour window) but haven't attempted anything YET today.
   Someone who already did today's quiz is excluded (nothing to
   remind them of); someone whose streak already broke days ago is
   also excluded (reminding them their streak is "at risk" would be
   wrong — it's already gone, that's a different kind of message).

   Two separate schedules, each running once daily at a different
   Africa/Lagos time, with a different tone — an early nudge and a
   later, more urgent one — deliberately NOT the same message twice,
   since a duplicate feels like spam rather than a genuine reminder.

   NOTE: scheduled functions require the Firebase project to be on
   the Blaze (pay-as-you-go) plan — Cloud Scheduler isn't available
   on the free Spark plan. See the deploy notes shared alongside
   this change.
========================================================= */

async function findStreakAtRiskUserIds() {
  const { todayStart, yesterdayStart } = lagosDayBoundaries();

  const [yesterdaySnap, todaySnap] = await Promise.all([
    db
      .collection("attempts")
      .where("completedAt", ">=", yesterdayStart)
      .where("completedAt", "<", todayStart)
      .get(),
    db.collection("attempts").where("completedAt", ">=", todayStart).get(),
  ]);

  const activeYesterday = new Set();
  yesterdaySnap.forEach((d) => activeYesterday.add(d.data().userId));

  const activeToday = new Set();
  todaySnap.forEach((d) => activeToday.add(d.data().userId));

  return [...activeYesterday].filter((uid) => !activeToday.has(uid));
}

/**
 * Africa/Lagos is UTC+1 year-round (no daylight saving), so this is
 * a fixed offset rather than needing a full timezone library —
 * still computed explicitly (not "new Date() - 24h") so it lines up
 * with actual Lagos calendar-day boundaries, the same principle as
 * toDayKey() in attemptsService.js on the client.
 */
function lagosDayBoundaries() {
  const LAGOS_OFFSET_MS = 60 * 60 * 1000;
  const nowLagos = new Date(Date.now() + LAGOS_OFFSET_MS);
  const todayStartLagos = Date.UTC(
    nowLagos.getUTCFullYear(),
    nowLagos.getUTCMonth(),
    nowLagos.getUTCDate(),
  );
  const todayStart = new Date(todayStartLagos - LAGOS_OFFSET_MS);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  return { todayStart, yesterdayStart };
}

async function notifyStreakAtRisk(message) {
  const userIds = await findStreakAtRiskUserIds();
  if (userIds.length === 0) return;

  const batch = db.batch();
  userIds.forEach((uid) => {
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      message,
      createdBy: "System",
      targetUserId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

exports.streakReminderAfternoon = onSchedule(
  { schedule: "0 14 * * *", timeZone: "Africa/Lagos" },
  async () => {
    await notifyStreakAtRisk(
      "🔥 Don't lose your streak — take a quick quiz today!",
    );
  },
);

exports.streakReminderEvening = onSchedule(
  { schedule: "0 20 * * *", timeZone: "Africa/Lagos" },
  async () => {
    await notifyStreakAtRisk(
      "⏰ Last call! Your streak resets at midnight — squeeze in one more quiz.",
    );
  },
);
