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

const INSTALLED_KEY = "qa_installed"; // declared first: read during module start-up below

// index.html captures these two events in a tiny inline script (before any
// module has loaded) and parks them on window, so the prompt isn't lost if
// the browser fires it while this file is still being fetched on a slow
// connection. The listeners below are the fallback if that script is gone.
let deferredPrompt = window.__qaDeferredPrompt || null;
let installed = isStandalone() || !!window.__qaInstalled || readInstalledFlag();
const listeners = new Set();

// The browser only offers the install prompt when the app is NOT
// installed, so receiving it also corrects a stale "installed" flag
// (e.g. the student uninstalled the app -- no event fires for that).
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installed = false;
  clearInstalledFlag();
  notify();
});

window.addEventListener("qa:bip", () => {
  deferredPrompt = window.__qaDeferredPrompt || deferredPrompt;
  installed = false;
  clearInstalledFlag();
  notify();
});

function handleInstalled() {
  deferredPrompt = null;
  installed = true;
  writeInstalledFlag();
  notify();
}
window.addEventListener("appinstalled", handleInstalled);
window.addEventListener("qa:installed", handleInstalled);

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
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

export function isIOS() {
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function canInstall() {
  return !!deferredPrompt && !installed;
}

/** True if this browser has ever told us Quiz Arena was installed. */
export function isInstalled() {
  return installed;
}

/** Subscribe to changes in install availability. Returns an unsubscribe fn. */
export function onInstallabilityChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Fires when the browser reports the install finished ("appinstalled").
 * On Android Chrome this is the real "it's on your phone now" signal --
 * it arrives after the system has finished building the app, which is why
 * the welcome screen waits for it instead of guessing.
 */
export function onAppInstalled(cb) {
  const handler = () => cb();
  window.addEventListener("appinstalled", handler);
  window.addEventListener("qa:installed", handler);
  return () => {
    window.removeEventListener("appinstalled", handler);
    window.removeEventListener("qa:installed", handler);
  };
}

/**
 * Chrome on Android can tell a normal browser tab that the app is
 * already installed (needs `related_applications` in the manifest).
 * Resolves false anywhere it isn't supported.
 */
export async function isInstalledElsewhere() {
  try {
    if (!navigator.getInstalledRelatedApps) return false;
    const apps = await navigator.getInstalledRelatedApps();
    return apps.length > 0;
  } catch {
    return false;
  }
}

/**
 * Fires the native install prompt. Resolves with the outcome
 * ("accepted" | "dismissed" | "unavailable" if there's no
 * captured prompt to show).
 *
 * A captured prompt can only be shown ONCE -- calling prompt() a
 * second time throws InvalidStateError -- so it is always discarded
 * after use. If the student dismissed it, the browser fires a fresh
 * "beforeinstallprompt" later, which re-arms canInstall().
 */
export async function triggerInstallPrompt() {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return { outcome: "unavailable" };

  deferredPrompt = null;
  window.__qaDeferredPrompt = null;

  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    notify();
    return { outcome };
  } catch (err) {
    console.warn("Install prompt failed:", err);
    notify();
    return { outcome: "unavailable" };
  }
}

function readInstalledFlag() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

function clearInstalledFlag() {
  try {
    localStorage.removeItem(INSTALLED_KEY);
  } catch {
    /* ignore */
  }
}

function writeInstalledFlag() {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    /* private mode -- fine, the flag is only a convenience */
  }
}

// Running as the installed app is itself proof it's installed.
if (isStandalone()) writeInstalledFlag();

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
const SNOOZE_DAYS = 3;

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
