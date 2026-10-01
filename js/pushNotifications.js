import { app, db } from "./firebase/config.js";
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { registerServiceWorker } from "./pwa.js";

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

const OFF_KEY = "qa-push-off";

let messagingInstance = null;
let foregroundListenerBound = false;

/* ---- in-app on/off switch (Settings) ----
   Browsers don't let a page revoke notification permission, so
   "off" here means: remove THIS device's token from the student's
   account (the server then has nowhere to send pushes) and
   remember the choice so we don't silently re-register on the next
   load. Turning it back on re-registers; no browser prompt is
   needed because permission was never taken away. */
function offFlag() {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

function setOffFlag(off) {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1");
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* private mode: only lasts this visit */
  }
}

/** "unsupported" | "denied" | "off" | "on" | "ask" */
export function getPushStatus() {
  if (!canUsePush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "ask";
  return offFlag() ? "off" : "on";
}

/** Turns push on for this device. Resolves with the new status. */
export async function enablePush(userId) {
  await requestPushPermission(userId); // clears the off flag + registers
  return getPushStatus();
}

/** Turns push off for this device. Resolves with the new status. */
export async function disablePush(userId) {
  setOffFlag(true);

  try {
    const messaging = await getMessagingInstance();
    const registration = messaging && (await registerServiceWorker());

    if (messaging && registration && userId) {
      // Same token registerDevice() saved (getToken returns the existing
      // one when permission is already granted -- no prompt).
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      }).catch(() => null);

      if (token) {
        await updateDoc(doc(db, "users", userId), {
          fcmTokens: arrayRemove(token),
        });
      }
      await deleteToken(messaging).catch(() => {});
    }
  } catch (err) {
    console.error("Failed to turn push off cleanly:", err);
  }

  return getPushStatus();
}

export async function initPushNotifications(userId) {
  if (!canUsePush()) return;
  if (Notification.permission !== "granted") return;
  if (offFlag()) return; // student switched push off in Settings

  await registerDevice(userId);
}

export async function requestPushPermission(userId) {
  if (!canUsePush()) return;

  setOffFlag(false); // an explicit "turn on" gesture

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

    // sw.js is the single service worker (caching + push). Registering a
    // second one at the same scope would evict it.
    const registration = await registerServiceWorker();
    if (!registration) return;

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
 *
 * NOTE: some browsers (notably Chrome on Android, in some
 * versions) intentionally suppress a manually-triggered
 * Notification() while the tab that created it is the focused,
 * frontmost one — that's a platform choice, not a bug here. Either
 * way the in-app bell stays live regardless: it's a direct Firestore
 * real-time listener (see listenToNotificationsForUser in
 * notificationsService.js, wired up in dashboard.js), completely
 * independent of whether this particular push shows an OS banner.
 */
function listenForForegroundMessages(messaging) {
  if (foregroundListenerBound) return;
  foregroundListenerBound = true;

  onMessage(messaging, (payload) => {
    if (offFlag()) return;
    const { title, body } = payload.data || {};
    if (title) {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    }
  });
}
