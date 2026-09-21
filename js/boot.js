/* =========================================================
   BOOT

   The tiny first script index.html loads. It exists so the welcome
   screen can paint and start typing IMMEDIATELY, while the heavy
   part of the app (main.js -> the Firebase SDK, ~1 MB from gstatic)
   downloads in parallel. On slow mobile data that's the difference
   between a blank loader and a welcome that's already talking.

   Order:
     1. register the service worker (starts the offline download)
     2. if this visitor needs the welcome gate, open it right now
     3. start loading main.js; it waits for the gate before it
        shows the sign-in page (see whenGateDone in main.js)
========================================================= */
import { registerServiceWorker, initConnectivityBanner } from "./pwa.js";
import { mountWelcomeGateIfNeeded } from "./ui/welcomeGate.js";

registerServiceWorker();
initConnectivityBanner();

mountWelcomeGateIfNeeded();
// The gate covers the boot loader, so it can go.
if (document.getElementById("welcomeGate")) {
  document.getElementById("bootLoader")?.remove();
}

import("./main.js").catch((err) => {
  // e.g. first visit on a dead connection: the SDK can't load.
  console.error("App failed to start:", err);
  const loader = document.getElementById("bootLoader");
  if (loader) loader.remove();
  if (!document.getElementById("welcomeGate")) showStartupError();
});

function showStartupError() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <div style="min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center;background:#2e1065;color:#f5f3ff;font-family:system-ui,sans-serif">
      <div>
        <h1 style="font-size:1.5rem;margin-bottom:8px">Can't reach Quiz Arena</h1>
        <p style="opacity:.8;margin-bottom:20px">Check your connection and try again.</p>
        <button onclick="location.reload()" style="font:inherit;font-weight:700;padding:14px 22px;border:0;border-radius:14px;background:#ffb454;color:#2a1200">Try again</button>
      </div>
    </div>`;
}
