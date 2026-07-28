import { auth } from "./firebase/config.js";

import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 1 hour
const INACTIVITY_LIMIT = 60 * 60 * 1000;
let inactivityTimer = null;
let started = false;
let loggingOut = false;
const activityEvents = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "click",
  "scroll",
  "wheel",
];

async function logoutDueToInactivity() {
  if (loggingOut) return;

  loggingOut = true;

  stopSessionManager();

  alert("You have been signed out due to inactivity.");

  await signOut(auth);

  window.location.href = "/index.html";
}
function resetTimer() {
  clearTimeout(inactivityTimer);

  inactivityTimer = setTimeout(logoutDueToInactivity, INACTIVITY_LIMIT);
}

export function startSessionManager() {
  // Already running?
  if (started) return;

  started = true;

  activityEvents.forEach((event) => {
    document.addEventListener(event, resetTimer);
  });

  resetTimer();
}

export function stopSessionManager() {
  if (!started) return;

  started = false;

  clearTimeout(inactivityTimer);
  inactivityTimer = null;

  activityEvents.forEach((event) => {
    document.removeEventListener(event, resetTimer);
  });
}
