import { auth } from "./firebase/config.js";
import { startSessionManager } from "./sessionManager.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { renderLanding } from "./ui/landing.js";
import { getUserData } from "./auth.js";
import { renderStudentDashboard } from "./student/dashboard.js";
import { renderAdminDashboard } from "./admin/dashboard.js";
import { initInstallNudge } from "./student/installNudge.js";
import { renderVerificationGate } from "./emailVerificationGate.js";
import {
  whenGateDone,
  closeWelcomeGate,
  markReturningUser,
} from "./ui/welcomeGate.js";

// The service worker is registered once, from js/boot.js (pwa.js).
const ADMIN_EMAIL = "admin@test.com";

let initialized = false;

/**
 * Hides the inline #bootLoader from index.html (see the <style>
 * block there for why it's inline). Called once the real page has
 * actually rendered, in a `finally` below so it always runs -- a
 * returning student never gets left staring at a stuck loader if
 * getUserData() throws.
 */
function hideBootLoader() {
  const el = document.getElementById("bootLoader");
  if (!el) return;
  el.classList.add("boot-loader-hide");
  setTimeout(() => el.remove(), 300);
}

async function renderStudent(user) {
  const userData = await getUserData(user.uid);
  renderStudentDashboard(userData);
}

function renderLoadError(user) {
  const app = document.getElementById("app");
  if (!app) return;
  const offline = !navigator.onLine;
  app.innerHTML = `
    <div style="min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center">
      <div style="max-width:22rem">
        <h1 style="font-size:1.4rem;color:#1e1b4b;margin-bottom:8px">
          ${offline ? "You're offline" : "Something went wrong"}
        </h1>
        <p style="color:#6b7280;margin-bottom:20px">
          ${
            offline
              ? "Connect to the internet once so Quiz Arena can save your data for offline use."
              : "We couldn't load your account. Please try again."
          }
        </p>
        <button id="retryLoad" style="font:inherit;font-weight:700;padding:14px 22px;border:0;border-radius:14px;background:#7c3aed;color:#fff">Try again</button>
      </div>
    </div>`;
  document.getElementById("retryLoad")?.addEventListener("click", () => location.reload());
}

onAuthStateChanged(auth, async (user) => {
  // Prevent running twice during initial auth resolution
  if (initialized) return;
  initialized = true;

  try {
    if (!user) {
      // New visitors see the welcome/download screen first; everyone
      // else gets a resolved promise and goes straight to sign-in.
      await whenGateDone();
      renderLanding();
      return;
    }

    // Signed in: a welcome screen that opened before auth resolved
    // has no business being here.
    markReturningUser();
    closeWelcomeGate({ instant: true });

    startSessionManager();
    initInstallNudge();

    if (user.email === ADMIN_EMAIL) {
      renderAdminDashboard();
      return;
    }

    // A returning session can still belong to a student who never
    // clicked their verification link -- this check runs on every
    // page load, not just at signup, so it also catches someone who
    // registered, closed the tab, and came straight back.
    if (!user.emailVerified) {
      renderVerificationGate(user, () => renderStudent(user));
      return;
    }

    await renderStudent(user);
  } catch (err) {
    // Most likely offline with nothing saved yet for this account.
    // Without this the loader is removed and the student sees a
    // blank page.
    console.error("Failed to load the app:", err);
    renderLoadError(user);
  } finally {
    hideBootLoader();
  }
});
