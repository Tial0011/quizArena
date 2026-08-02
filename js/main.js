import { auth } from "./firebase/config.js";
import { startSessionManager } from "./sessionManager.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { renderLanding } from "./ui/landing.js";
import { getUserData } from "./auth.js";
import { renderStudentDashboard } from "./student/dashboard.js";
import { renderAdminDashboard } from "./admin/dashboard.js";
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.error("SW registration failed:", err));
  });
}
const ADMIN_EMAIL = "admin@test.com";

let initialized = false;

onAuthStateChanged(auth, async (user) => {
  // Prevent running twice during initial auth resolution
  if (initialized) return;
  initialized = true;

  if (!user) {
    renderLanding();
    return;
  }

  startSessionManager();

  if (user.email === ADMIN_EMAIL) {
    renderAdminDashboard();
    return;
  }

  const userData = await getUserData(user.uid);

  renderStudentDashboard(userData);
});
