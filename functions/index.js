const functions = require("firebase-functions");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

/* =========================================================
   PAYMENTS — Flutterwave purchase verification
========================================================= */
exports.verifyFlutterwavePurchase = functions.https.onCall(async (request) => {
  const { userId, quizId, txRef, transactionId } = request.data;

  // Must be logged in, and can only confirm a purchase for themselves.
  if (!request.auth || request.auth.uid !== userId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Not authorized.",
    );
  }

  if (!quizId || !txRef || !transactionId) {
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

  // 2. Look up the quiz so we check the REAL price, not whatever the client sent.
  const quizSnap = await db.collection("quizzes").doc(quizId).get();
  if (!quizSnap.exists) {
    return { success: false, message: "Quiz not found." };
  }
  const quiz = quizSnap.data();
  if (tx.currency !== "NGN" || tx.amount < quiz.price) {
    console.log("Amount/currency check failed", {
      txAmount: tx.amount,
      txCurrency: tx.currency,
      quizPrice: quiz.price,
    });
    return { success: false, message: "Payment amount mismatch." };
  }

  if (tx.tx_ref !== txRef) {
    console.log("tx_ref mismatch", {
      fromFlutterwave: tx.tx_ref,
      fromClient: txRef,
    });
    return { success: false, message: "Transaction reference mismatch." };
  }

  // 3. Prevent the same payment being processed twice.
  const txRecordRef = db
    .collection("flutterwaveTransactions")
    .doc(String(transactionId));
  const alreadyProcessed = await db.runTransaction(async (t) => {
    const txDoc = await t.get(txRecordRef);
    if (txDoc.exists) return true;
    t.set(txRecordRef, {
      userId,
      quizId,
      txRef,
      amount: tx.amount,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return false;
  });

  if (alreadyProcessed) {
    return { success: true, message: "Already processed." };
  }

  // 4. Check they don't already own it.
  const existing = await db
    .collection("purchases")
    .where("userId", "==", userId)
    .where("quizId", "==", quizId)
    .where("status", "==", "paid")
    .get();

  if (!existing.empty) {
    return {
      success: true,
      alreadyOwned: true,
      message: "You already own this quiz.",
    };
  }

  // 5. Same writes purchaseQuiz() used to do client-side — now done here, server-side.
  const purchaseRef = await db.collection("purchases").add({
    quizId,
    userId,
    purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "paid",
    txRef,
    transactionId,
  });

  await db
    .collection("users")
    .doc(userId)
    .update({
      purchasedQuizzes: admin.firestore.FieldValue.arrayUnion(purchaseRef.id),
    });

  return {
    success: true,
    purchaseId: purchaseRef.id,
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

    const { message, targetUserId } = data;

    const tokens = await collectTokens(targetUserId);
    if (tokens.length === 0) return;

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "Quiz Arena",
        body: message,
      },
      webpush: {
        fcmOptions: {
          link: "/",
        },
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
