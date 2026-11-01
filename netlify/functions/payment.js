const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const WELCOME_QUIZ_ID = "odlJoarhn2atl14EpZq6";
const RANKS = [
  { at: 1, title: "Quiz Arena Rookie", emoji: "🌱" },
  { at: 3, title: "Quiz Arena Scholar", emoji: "📘" },
  { at: 5, title: "Quiz Arena Topper", emoji: "🔥" },
  { at: 8, title: "Quiz Arena Legend", emoji: "👑" },
];

function paymentConfig() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const flutterwaveSecret = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!rawServiceAccount || !flutterwaveSecret) {
    throw new Error("Payment service is not configured.");
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    throw new Error("Payment service is not configured.");
  }
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  return { db: getFirestore(), flutterwaveSecret };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function validQuizIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && id))];
}

function rankFor(count) {
  let rank = null;
  RANKS.forEach((entry) => { if (count >= entry.at) rank = entry; });
  return rank;
}

async function flutterwaveJson(url, secret) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function quoteFee(amount, secret) {
  if (!Number.isInteger(amount)) throw new Error("Invalid checkout amount.");
  const { response, data } = await flutterwaveJson(
    `https://api.flutterwave.com/v3/transactions/fee?amount=${encodeURIComponent(amount)}&currency=NGN&payment_type=card`,
    secret,
  );
  const chargeAmount = Number(data?.data?.charge_amount);
  const fee = Number(data?.data?.fee);
  if (!response.ok || data?.status !== "success" || !Number.isFinite(chargeAmount) || !Number.isFinite(fee) || chargeAmount < amount) {
    throw new Error("Flutterwave could not return a valid fee quote.");
  }
  return { chargeAmount, fee };
}

async function quotePurchase(db, secret, quizIds) {
  if (!quizIds.length || quizIds.length > 50 || quizIds.includes(WELCOME_QUIZ_ID)) {
    return { success: false, message: "Invalid quiz selection." };
  }
  const quizDocs = await Promise.all(quizIds.map((id) => db.collection("quizzes").doc(id).get()));
  if (quizDocs.some((doc) => !doc.exists)) return { success: false, message: "A selected quiz was not found." };

  const netKobo = quizDocs.reduce((sum, doc) => sum + Math.round(Number(doc.data().price || 0) * 100), 0);
  if (!Number.isSafeInteger(netKobo) || netKobo <= 0) return { success: false, message: "Invalid quiz price." };

  let feeKobo = 0;
  let feeVatKobo = 0;
  for (let i = 0; i < 3; i += 1) {
    const quote = await quoteFee(Math.ceil((netKobo + feeVatKobo) / 100), secret);
    feeKobo = Math.round(quote.fee * 100);
    feeVatKobo = Math.ceil(feeKobo * 1.075 / 100) * 100 - feeKobo;
  }
  const widgetAmountKobo = netKobo + feeVatKobo;
  const customerTotalKobo = widgetAmountKobo + feeKobo;
  return {
    success: true,
    net: netKobo / 100,
    quizVat: feeVatKobo / 100,
    flutterwaveFee: feeKobo / 100,
    total: customerTotalKobo / 100,
    customerTotal: customerTotalKobo / 100,
    productAmount: netKobo / 100,
    widgetAmount: widgetAmountKobo / 100,
  };
}

async function verifyPurchase(db, secret, userId, quizIds, txRef, transactionId) {
  if (!quizIds.length || quizIds.length > 50 || !txRef || !transactionId || quizIds.includes(WELCOME_QUIZ_ID)) {
    return { success: false, message: "Missing or invalid payment information." };
  }
  const { data: verification } = await flutterwaveJson(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    secret,
  );
  if (verification?.status !== "success" || verification?.data?.status !== "successful") {
    return { success: false, message: "Payment could not be verified yet." };
  }
  const tx = verification.data;
  if (tx.tx_ref !== txRef || !String(tx.tx_ref).includes(userId)) {
    return { success: false, message: "Transaction reference mismatch." };
  }
  const quizDocs = await Promise.all(quizIds.map((id) => db.collection("quizzes").doc(id).get()));
  if (quizDocs.some((doc) => !doc.exists)) return { success: false, message: "One of the quizzes was not found." };
  const quizzes = quizDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const transactionRef = db.collection("flutterwaveTransactions").doc(String(transactionId));

  const outcome = await db.runTransaction(async (transaction) => {
    const processed = await transaction.get(transactionRef);
    if (processed.exists) return { alreadyProcessed: true, purchasedIds: processed.data().quizIds || [] };

    const ownedSnapshot = await transaction.get(
      db.collection("purchases").where("userId", "==", userId).where("status", "==", "paid"),
    );
    const owned = new Set(ownedSnapshot.docs.map((doc) => doc.data().quizId));
    const toGrant = quizzes.filter((quiz) => !owned.has(quiz.id));
    if (!toGrant.length) return { alreadyOwned: true, purchasedIds: [] };

    const expectedNetKobo = toGrant.reduce((sum, quiz) => sum + Math.round(Number(quiz.price || 0) * 100), 0);
    const transactionAmountKobo = Math.round(Number(tx.amount) * 100);
    const chargedAmountKobo = Math.round(Number(tx.charged_amount ?? tx.amount) * 100);
    const settledKobo = Math.round(Number(tx.amount_settled) * 100);
    if (tx.currency !== "NGN" || !Number.isFinite(transactionAmountKobo) || transactionAmountKobo < expectedNetKobo || !Number.isFinite(chargedAmountKobo) || chargedAmountKobo < transactionAmountKobo || !Number.isFinite(settledKobo) || settledKobo < expectedNetKobo) {
      return { mismatch: true };
    }

    const purchaseIds = toGrant.map(() => db.collection("purchases").doc().id);
    toGrant.forEach((quiz, index) => {
      transaction.set(db.collection("purchases").doc(purchaseIds[index]), {
        quizId: quiz.id, userId, purchasedAt: FieldValue.serverTimestamp(), status: "paid", txRef, transactionId,
      });
    });
    transaction.set(transactionRef, {
      userId, quizIds: toGrant.map((quiz) => quiz.id), txRef, amount: tx.amount,
      amountSettled: tx.amount_settled ?? null, flutterwaveFee: tx.app_fee ?? null,
      paymentType: tx.payment_type ?? null, processedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(db.collection("users").doc(userId), {
      purchasedQuizzes: FieldValue.arrayUnion(...purchaseIds),
    });
    const summary = toGrant.length === 1
      ? `🎉 You now own "${toGrant[0].title}"! Find it under My Quizzes.`
      : `🎉 ${toGrant.length} quizzes unlocked! Find them under My Quizzes.`;
    toGrant.forEach((quiz, index) => transaction.set(db.collection("notifications").doc(), {
      message: `🎉 You now own "${quiz.title}"! Find it under My Quizzes.`, createdBy: "System",
      targetUserId: userId, createdAt: FieldValue.serverTimestamp(),
      ...(index === 0 ? { pushMessage: summary } : { skipPush: true }),
    }));
    const before = rankFor(owned.size);
    const after = rankFor(owned.size + toGrant.length);
    if (after && (!before || after.at > before.at)) {
      transaction.set(db.collection("notifications").doc(), {
        message: `${after.emoji} You're now a ${after.title}! Check your dashboard.`, createdBy: "System",
        targetUserId: userId, createdAt: FieldValue.serverTimestamp(), skipPush: true,
      });
    }
    return { purchasedIds: toGrant.map((quiz) => quiz.id) };
  });
  if (outcome.mismatch) return { success: false, message: "Payment amount mismatch." };
  if (outcome.alreadyOwned) return { success: true, alreadyOwned: true, purchasedIds: [], message: "You already own these quizzes." };
  if (outcome.alreadyProcessed) return { success: true, purchasedIds: outcome.purchasedIds, message: "Already processed." };
  return { success: true, purchasedIds: outcome.purchasedIds, message: "Purchase successful." };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { Allow: "POST, OPTIONS" }, body: "" };
  if (event.httpMethod !== "POST") return json(405, { success: false, message: "Method not allowed." });
  try {
    const body = JSON.parse(event.body || "{}");
    const authorization = event.headers.authorization || event.headers.Authorization;
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const { db, flutterwaveSecret } = paymentConfig();
    if (!token) return json(401, { success: false, message: "Please sign in again." });
    const decoded = await getAuth().verifyIdToken(token);
    if (body.userId && body.userId !== decoded.uid) return json(403, { success: false, message: "Not authorized." });
    const quizIds = validQuizIds(body.quizIds);
    const result = body.action === "quote"
      ? await quotePurchase(db, flutterwaveSecret, quizIds)
      : body.action === "verify"
        ? await verifyPurchase(db, flutterwaveSecret, decoded.uid, quizIds, body.txRef, body.transactionId)
        : { success: false, message: "Unknown payment action." };
    return json(result.success ? 200 : 400, result);
  } catch (error) {
    console.error("Payment function failed:", error);
    return json(500, { success: false, message: "Checkout is temporarily unavailable. Please try again." });
  }
};
