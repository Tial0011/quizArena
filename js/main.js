import { auth } from "./firebase/config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { renderLanding } from "./ui/landing.js";

import { getUserData } from "./auth.js";

import { renderStudentDashboard } from "./student/dashboard.js";

import { logoutUser } from "./auth.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    renderLanding();
    return;
  }

  const userData = await getUserData(user.uid);

  renderStudentDashboard(userData);
});
