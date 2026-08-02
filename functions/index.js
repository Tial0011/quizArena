const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

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
    return { success: false, message: "Payment amount mismatch." };
  }

  if (tx.tx_ref !== txRef) {
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
