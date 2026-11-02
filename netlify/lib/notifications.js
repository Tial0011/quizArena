const { randomUUID } = require("node:crypto");

const BROADCAST_TARGET = "all";
const NOTIFICATION_BATCH_SIZE = 20;
const PUSH_CURSOR_COLLECTION = "netlifyFunctionState";
const PUSH_CURSOR_ID = "notificationPush";
const PUSH_LEASE_MS = 5 * 60 * 1000;

async function collectTokens(db, targetUserId) {
  if (targetUserId && targetUserId !== BROADCAST_TARGET) {
    const user = await db.collection("users").doc(targetUserId).get();
    const tokens = user.exists ? user.data().fcmTokens : [];
    return Array.isArray(tokens) ? [...new Set(tokens)] : [];
  }

  const students = await db.collection("users")
    .where("role", "==", "student")
    .get();
  const tokens = [];
  students.forEach((student) => {
    if (Array.isArray(student.data().fcmTokens)) tokens.push(...student.data().fcmTokens);
  });
  return [...new Set(tokens)];
}

async function cleanupInvalidTokens(db, FieldValue, tokens, response, targetUserId) {
  const invalidTokens = [];
  response.responses.forEach((result, index) => {
    const code = result.error?.code;
    if (!result.success && (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    )) invalidTokens.push(tokens[index]);
  });
  if (!invalidTokens.length) return;

  if (targetUserId && targetUserId !== BROADCAST_TARGET) {
    await db.collection("users").doc(targetUserId).update({
      fcmTokens: FieldValue.arrayRemove(...invalidTokens),
    });
    return;
  }

  const students = await db.collection("users")
    .where("role", "==", "student")
    .get();
  const batch = db.batch();
  let hasWrites = false;
  students.forEach((student) => {
    const ownedTokens = (student.data().fcmTokens || [])
      .filter((token) => invalidTokens.includes(token));
    if (!ownedTokens.length) return;
    batch.update(student.ref, {
      fcmTokens: FieldValue.arrayRemove(...ownedTokens),
    });
    hasWrites = true;
  });
  if (hasWrites) await batch.commit();
}

async function sendPush(db, messaging, FieldValue, notification) {
  const data = notification.data();
  if (!data.message || data.skipPush) return;

  const targetUserId = data.targetUserId;
  const message = data.pushMessage || (data.actionType === "startWelcomeQuiz"
    ? "Your free GES 111 Communications in English quiz is ready. Tap to start now—no purchase needed."
    : data.message);
  const tokens = await collectTokens(db, targetUserId);
  for (let offset = 0; offset < tokens.length; offset += 500) {
    const tokenBatch = tokens.slice(offset, offset + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: tokenBatch,
      data: {
        title: "Quiz Arena",
        body: message,
        actionType: data.actionType || "",
      },
      webpush: { headers: { Urgency: "high" } },
      android: { priority: "high" },
    });
    await cleanupInvalidTokens(db, FieldValue, tokenBatch, response, targetUserId);
  }
}

async function acquirePushLease(db, Timestamp, FieldValue, now) {
  const stateRef = db.collection(PUSH_CURSOR_COLLECTION).doc(PUSH_CURSOR_ID);
  const leaseId = randomUUID();
  let cursor;
  const acquired = await db.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef);
    const stateData = state.exists ? state.data() : {};
    if ((stateData.leaseExpiresAt?.toMillis?.() || 0) > now.getTime()) return false;

    cursor = stateData.lastProcessedAt
      ? {
        createdAt: stateData.lastProcessedAt,
        documentId: stateData.lastProcessedId || "",
      }
      : {
        createdAt: Timestamp.fromMillis(now.getTime() - 15 * 60 * 1000),
        documentId: "",
      };
    transaction.set(stateRef, {
      leaseId,
      leaseExpiresAt: Timestamp.fromMillis(now.getTime() + PUSH_LEASE_MS),
      ...(state.exists ? {} : {
        lastProcessedAt: cursor.createdAt,
        lastProcessedId: cursor.documentId,
      }),
    }, { merge: true });
    return true;
  });
  return acquired ? { stateRef, leaseId, cursor } : null;
}

async function savePushCursor(db, Timestamp, lease, notification) {
  const createdAt = notification.data().createdAt;
  if (!createdAt?.toMillis) {
    throw new Error(`Notification ${notification.id} has no valid createdAt timestamp.`);
  }
  await db.runTransaction(async (transaction) => {
    const state = await transaction.get(lease.stateRef);
    if (!state.exists || state.data().leaseId !== lease.leaseId) {
      throw new Error("Notification dispatch lease expired before cursor update.");
    }
    transaction.update(lease.stateRef, {
      lastProcessedAt: createdAt,
      lastProcessedId: notification.id,
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + PUSH_LEASE_MS),
    });
  });
  lease.cursor = { createdAt, documentId: notification.id };
}

async function releasePushLease(db, Timestamp, lease) {
  await db.runTransaction(async (transaction) => {
    const state = await transaction.get(lease.stateRef);
    if (!state.exists || state.data().leaseId !== lease.leaseId) return;
    transaction.update(lease.stateRef, {
      leaseId: null,
      leaseExpiresAt: Timestamp.fromMillis(0),
    });
  });
}

async function dispatchPendingNotificationPushes(
  db,
  messaging,
  Timestamp,
  FieldPath,
  FieldValue,
  now = new Date(),
) {
  const lease = await acquirePushLease(db, Timestamp, FieldValue, now);
  if (!lease) return;

  try {
    const snapshot = await db.collection("notifications")
      .orderBy("createdAt", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .startAfter(lease.cursor.createdAt, lease.cursor.documentId)
      .limit(NOTIFICATION_BATCH_SIZE)
      .get();

    for (const notification of snapshot.docs) {
      if (!notification.data().pushDispatchedAt) {
        await sendPush(db, messaging, FieldValue, notification);
        await notification.ref.update({
          pushDispatchedAt: FieldValue.serverTimestamp(),
        });
      }
      await savePushCursor(db, Timestamp, lease, notification);
    }
  } finally {
    await releasePushLease(db, Timestamp, lease);
  }
}

module.exports = { dispatchPendingNotificationPushes };
