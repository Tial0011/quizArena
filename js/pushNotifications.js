import { app, db } from "./firebase/config.js";
import {
  doc,
  updateDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

/* =========================================================
   PUSH NOTIFICATIONS (Firebase Cloud Messaging)

   Separate from notificationsService.js (which handles the in-app
   bell) — this file is purely about getting an actual OS/phone-level
   notification delivered: registering the service worker, asking
   permission, and saving the resulting device token onto the
   student's user doc. The Cloud Function in functions/index.js is
   what actually sends the push when a notification doc is created —
   this file only handles the client's half (getting a token and
   keeping it saved).

   REQUIRED SETUP before any of this does anything — see the
   handoff note for the full checklist:
   1. Paste a real VAPID key below (Firebase Console → Project
      Settings → Cloud Messaging → Web Push certificates).
   2. firebase-messaging-sw.js must be deployed at the site ROOT
      (same level as index.html).
   3. functions/ must be deployed (firebase deploy --only functions).

   Two entry points, deliberately kept separate:
   - initPushNotifications(userId): called on every dashboard load.
     Silent — only proceeds if the student already granted
     permission in an earlier session. Never shows a prompt.
   - requestPushPermission(userId): called from the bell's click
     handler (a real user gesture). This is the one that actually
     shows the "Allow notifications?" prompt — Safari in particular
     requires that prompt to happen inside a genuine click, not on
     page load, so the prompt itself never fires outside a gesture.
========================================================= */

const VAPID_KEY =
  "BALAQn75y9VflszHDHT3I4yMUzhZ_TF_wouH6aBo1oQvOzHXgWz-8KKolrcyVJNWWUu0PJuyBbo7rYU5NxKvizo";

let messagingInstance = null;
let foregroundListenerBound = false;

export async function initPushNotifications(userId) {
  if (!canUsePush()) return;
  if (Notification.permission !== "granted") return;

  await registerDevice(userId);
}

export async function requestPushPermission(userId) {
  if (!canUsePush()) return;

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
  } else if (Notification.permission !== "granted") {
    // Already denied in a past session — browsers don't allow
    // re-prompting from JS once that's happened; the student has to
    // change it in their own browser settings.
    return;
  }

  await registerDevice(userId);
}

function canUsePush() {
  return "Notification" in window && "serviceWorker" in navigator;
}

/**
 * Registers this device with FCM and saves the resulting token onto
 * the student's user doc. Doesn't throw — same "supplementary,
 * never block the UI" rule as the rest of the notification
 * pipeline; a failed push registration should never interrupt the
 * dashboard loading.
 */
async function registerDevice(userId) {
  if (!userId) return;

  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return;

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return;

    // arrayUnion so a student signed in on more than one
    // device/browser accumulates multiple tokens rather than each
    // new registration overwriting the last.
    await updateDoc(doc(db, "users", userId), {
      fcmTokens: arrayUnion(token),
    });

    listenForForegroundMessages(messaging);
  } catch (err) {
    console.error("Failed to set up push notifications:", err);
  }
}

async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * FCM only auto-shows an OS notification for BACKGROUND messages —
 * that's handled by firebase-messaging-sw.js. If the student
 * already has the tab open, the message instead arrives here
 * silently, so it's shown manually via the same Notification API
 * the service worker uses for the background case.
 */
function listenForForegroundMessages(messaging) {
  if (foregroundListenerBound) return;
  foregroundListenerBound = true;

  onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {};
    if (!title) return;

    new Notification(title, { body, icon: "/icons/icon-192.png" });
  });
}
