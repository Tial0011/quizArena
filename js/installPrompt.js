/* =========================================================
   INSTALL PROMPT (shared)

   Single source of truth for the browser's "beforeinstallprompt"
   event. The event only fires once per page load and only the
   listener that's attached at that moment gets it -- so this
   module is imported once, at app start (js/main.js), and every
   other module (landing page button, dashboard nudge) reads the
   captured prompt from here instead of each registering its own
   listener and racing for it.
========================================================= */

let deferredPrompt = null;
let installed = isStandalone();
const listeners = new Set();

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  notify();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  installed = true;
  notify();
});

function notify() {
  listeners.forEach((cb) => cb());
}

/**
 * True once the app is actually running as an installed PWA
 * (standalone window) -- iOS Safari doesn't fire
 * "beforeinstallprompt"/"appinstalled" at all, so this also
 * checks the iOS-only `navigator.standalone` flag.
 */
export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function canInstall() {
  return !!deferredPrompt && !installed;
}

/** Subscribe to changes in install availability. Returns an unsubscribe fn. */
export function onInstallabilityChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Fires the native install prompt. Resolves with the outcome
 * ("accepted" | "dismissed" | "unavailable" if there's no
 * captured prompt to show).
 */
export async function triggerInstallPrompt() {
  if (!deferredPrompt) return { outcome: "unavailable" };

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    deferredPrompt = null;
  }

  return { outcome };
}

/* =========================================================
   RECURRING NUDGE SCHEDULING

   A dismissal snoozes the nudge for a few days -- it does NOT
   permanently hide it. That's the point: instead of the old
   "show the install button once on the landing page and never
   again," a student who ignores it now gets a gentle reminder
   again a few days later, next time they're on the dashboard,
   until they actually install (or the browser stops offering the
   prompt because it's already installed).
========================================================= */
const STORAGE_KEY = "qa_install_nudge";
const SNOOZE_DAYS = 0.1;

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing / storage full -- the nudge just won't
    // remember it was dismissed this session, which is a safe
    // failure (worst case it shows a bit more often).
  }
}

export function shouldShowNudge() {
  if (!canInstall()) return false;

  const { lastShownAt } = readState();
  if (!lastShownAt) return true;

  return Date.now() - lastShownAt > SNOOZE_DAYS * 86400000;
}

export function snoozeNudge() {
  const state = readState();
  writeState({
    lastShownAt: Date.now(),
    dismissCount: (state.dismissCount || 0) + 1,
  });
}
