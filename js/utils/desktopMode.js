/* =========================================================
   DESKTOP MODE (the "Desktop site" option, but inside the app)

   A web page can't flip the browser's own "Desktop site" switch.
   What it CAN do is what that switch does under the hood: tell
   the phone to lay the page out on a wide virtual screen instead
   of the phone's real width. That's done by changing the
   <meta name="viewport"> width. Every desktop breakpoint in the
   app (sidebar layout, 1024px+) then kicks in, and the student
   can pinch-zoom to read it.

   - Saved per device in localStorage ("qa-desktop-mode").
   - index.html applies the saved choice before first paint using
     the same logic (see the inline script there), so there is no
     flash of the mobile layout.
   - Does nothing useful on a real desktop/laptop (already wide).
========================================================= */

const KEY = "qa-desktop-mode";
export const DESKTOP_WIDTH = 1100;

const MOBILE_CONTENT = "width=device-width, initial-scale=1.0, viewport-fit=cover";
const DESKTOP_CONTENT = `width=${DESKTOP_WIDTH}, initial-scale=0.1, minimum-scale=0.1, maximum-scale=5, user-scalable=yes, viewport-fit=cover`;

export function isDesktopModeOn() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** True on phones/tablets, where this setting actually changes something. */
export function desktopModeUseful() {
  return (
    window.matchMedia?.("(pointer: coarse)").matches === true ||
    Math.min(screen.width, screen.height) < 820
  );
}

function meta() {
  let m = document.querySelector('meta[name="viewport"]');
  if (!m) {
    m = document.createElement("meta");
    m.name = "viewport";
    document.head.appendChild(m);
  }
  return m;
}

export function applyDesktopMode(on) {
  const m = meta();
  document.documentElement.classList.toggle("qa-desktop-mode", on);

  if (!on) {
    m.setAttribute("content", MOBILE_CONTENT);
    return;
  }

  // initial-scale is computed so the whole 1100px page fits the phone's
  // width on first load; the student can still pinch in to read.
  const fit = Math.min(1, (window.innerWidth || screen.width || 390) / DESKTOP_WIDTH);
  m.setAttribute(
    "content",
    `width=${DESKTOP_WIDTH}, initial-scale=${fit.toFixed(3)}, minimum-scale=${Math.min(fit, 0.25).toFixed(3)}, maximum-scale=5, user-scalable=yes, viewport-fit=cover`,
  );
}

export function setDesktopMode(on) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode: still applies for this visit */
  }
  applyDesktopMode(on);
}

/** Call once at app start (also covers browsers where the inline script didn't run). */
export function initDesktopMode() {
  if (isDesktopModeOn()) applyDesktopMode(true);
}
