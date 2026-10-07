// Tracks student logins and "who is active right now" so the admin
// dashboard can show Online / Active / Logins / New-user numbers.
//
// Data written:
//   users/{uid}.lastActiveAt   heartbeat, refreshed while the app is open & visible
//   users/{uid}.lastLoginAt    last explicit sign-in
//   users/{uid}.loginCount     lifetime sign-ins
//   loginEvents/{auto}         one doc per sign-in { uid, email, at } (for "logins today / 7d")
//
// Everything here is best-effort: a failed write must never break
// sign-in or the student UI, so every call swallows its own errors.

import { auth, db } from "./firebase/config.js";

import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ADMIN_EMAIL = "admin@test.com";

// Admin "Online now" counts anyone whose heartbeat is newer than
// ONLINE_WINDOW_MS (see js/admin/dashboard.js). Keep the window a bit
// more than 2x the heartbeat so one missed beat doesn't flip a user offline.
export const HEARTBEAT_MS = 2 * 60 * 1000;
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

let heartbeatTimer = null;

function isTrackable(user) {
  return !!user && user.email !== ADMIN_EMAIL;
}

/** Call once per explicit sign-in (email, Google, or fresh registration). */
export async function recordLogin(user) {
  if (!isTrackable(user)) return;

  try {
    await Promise.all([
      addDoc(collection(db, "loginEvents"), {
        uid: user.uid,
        email: user.email || "",
        at: serverTimestamp(),
      }),
      setDoc(
        doc(db, "users", user.uid),
        {
          lastLoginAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
          loginCount: increment(1),
        },
        { merge: true },
      ),
    ]);
  } catch (err) {
    console.warn("[activity] recordLogin failed", err);
  }
}

async function beat() {
  const user = auth.currentUser;
  if (!isTrackable(user)) return;
  // Hidden tabs aren't "active"; skip the write.
  if (document.visibilityState === "hidden") return;

  try {
    await setDoc(
      doc(db, "users", user.uid),
      { lastActiveAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn("[activity] heartbeat failed", err);
  }
}

function onVisible() {
  if (document.visibilityState === "visible") beat();
}

/** Starts the heartbeat. Safe to call repeatedly. */
export function startPresence() {
  if (heartbeatTimer) return;

  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", onVisible);
}

export function stopPresence() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  document.removeEventListener("visibilitychange", onVisible);
}
