/* =========================================================
   PWA HELPERS

   - registerServiceWorker(): the ONE place the service worker is
     registered (main.js and pushNotifications.js both go through it,
     so they always share a single registration).
   - watchPrecache(): reports how much of the app has been saved for
     offline use. sw.js broadcasts progress while it installs; this
     also reads the "finished" marker it leaves in Cache Storage, so a
     returning visitor (whose install finished long ago) gets an
     immediate answer.
   - initConnectivityBanner(): small "You're offline" pill.
========================================================= */

const SW_URL = "/sw.js";
const META_KEY = "/__qa_precache_meta";

let registrationPromise = null;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  if (registrationPromise) return registrationPromise;

  registrationPromise = new Promise((resolve) => {
    const go = () =>
      navigator.serviceWorker
        .register(SW_URL)
        .then(resolve)
        .catch((err) => {
          console.error("SW registration failed:", err);
          resolve(null);
        });

    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  });

  return registrationPromise;
}

/** Last "offline copy" marker written by sw.js, or null. */
export async function readPrecacheMeta() {
  try {
    if (!("caches" in window)) return null;
    const res = await caches.match(META_KEY);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * cb({ done, total, failed, ready }) fires on every update from the service
 * worker, plus once up front from the saved marker. Returns a stop fn.
 */
export function watchPrecache(cb) {
  if (!("serviceWorker" in navigator)) return () => {};

  const onMessage = (event) => {
    const d = event.data;
    if (d && d.type === "qa-precache") {
      cb({ done: d.done, total: d.total, failed: d.failed || 0, ready: !!d.ready });
    }
  };
  navigator.serviceWorker.addEventListener("message", onMessage);

  readPrecacheMeta().then((meta) => {
    if (meta && meta.ready) cb({ done: meta.done, total: meta.total, failed: 0, ready: true });
  });

  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}

/* ---------------------------------------------------------
   ONLINE / OFFLINE PILL
--------------------------------------------------------- */
let bannerMounted = false;

export function initConnectivityBanner() {
  if (bannerMounted) return;
  bannerMounted = true;

  const pill = document.createElement("div");
  pill.id = "qaNet";
  pill.className = "qa-net";
  pill.setAttribute("role", "status");
  pill.setAttribute("aria-live", "polite");
  document.body.appendChild(pill);

  let hideTimer = null;

  function show(text, tone) {
    clearTimeout(hideTimer);
    pill.textContent = text;
    pill.dataset.tone = tone;
    pill.classList.add("qa-net-show");
  }
  function hide() {
    pill.classList.remove("qa-net-show");
  }

  window.addEventListener("offline", () =>
    show("You're offline. Saved quizzes still work.", "offline"),
  );
  window.addEventListener("online", () => {
    show("Back online", "online");
    hideTimer = setTimeout(hide, 2200);
  });

  if (!navigator.onLine) show("You're offline. Saved quizzes still work.", "offline");
}
