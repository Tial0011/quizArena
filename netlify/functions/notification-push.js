const { getFirebaseAdmin } = require("../lib/firebaseAdmin");
const { dispatchPendingNotificationPushes } = require("../lib/notifications");

exports.handler = async () => {
  try {
    const { db, messaging, Timestamp, FieldPath, FieldValue } = getFirebaseAdmin();
    await dispatchPendingNotificationPushes(
      db,
      messaging,
      Timestamp,
      FieldPath,
      FieldValue,
    );
    return { statusCode: 200, body: "Pending notification pushes dispatched." };
  } catch (error) {
    console.error("Scheduled notification dispatch failed:", error);
    throw error;
  }
};
