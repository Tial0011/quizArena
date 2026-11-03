const { timingSafeEqual } = require("node:crypto");
const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { json } = require("../lib/http");
const { verifyPaymentForOrder } = require("./payment");

const WEBHOOK_PROJECTS = [
  {
    projectId: "quizarena-2c75e",
    secretEnv: "FLUTTERWAVE_WEBHOOK_SECRET_HASH",
  },
  {
    projectId: "quiz-arena-staging",
    secretEnv: "FLUTTERWAVE_WEBHOOK_SECRET_HASH_STAGING",
  },
];

function matchesSecret(signature, expected) {
  if (!signature || !expected) return false;
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Method not allowed." });
  }

  const signature = event.headers?.["verif-hash"] || event.headers?.["Verif-Hash"];
  const project = WEBHOOK_PROJECTS.find(({ secretEnv }) =>
    matchesSecret(signature, process.env[secretEnv]),
  );
  if (!project) return json(401, { message: "Invalid webhook signature." });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { message: "Invalid webhook payload." });
  }

  const payment = payload.data;
  if (payload.event !== "charge.completed" || !payment?.id || !payment?.tx_ref) {
    return json(200, { received: true });
  }

  try {
    const { db } = getFirebaseAdmin(project.projectId);
    const order = await db.collection("checkoutOrders").doc(String(payment.tx_ref)).get();
    if (!order.exists) return json(200, { received: true });

    const result = await verifyPaymentForOrder(
      project.projectId,
      order.data(),
      String(payment.tx_ref),
      String(payment.id),
    );
    if (!result.success && result.message !== "Payment amount mismatch.") {
      return json(503, { message: "Payment is not confirmed yet." });
    }
    return json(200, { received: true });
  } catch (error) {
    console.error("Flutterwave webhook processing failed:", error);
    return json(503, { message: "Payment processing is temporarily unavailable." });
  }
};
