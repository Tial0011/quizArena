import { auth } from "./firebase/config.js";
import { startSessionManager } from "./sessionManager.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { renderLanding } from "./ui/landing.js";
import { getUserData } from "./auth.js";
import { renderStudentDashboard } from "./student/dashboard.js";
import { renderAdminDashboard } from "./admin/dashboard.js";
import { initInstallNudge } from "./student/installNudge.js";
import { renderVerificationGate } from "./emailVerificationGate.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.error("SW registration failed:", err));
  });
}
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

onAuthStateChanged(auth, async (user) => {
  // Prevent running twice during initial auth resolution
  if (initialized) return;
  initialized = true;

  try {
    if (!user) {
      renderLanding();
      return;
    }

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
  } finally {
    hideBootLoader();
  }
});
