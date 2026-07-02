import { auth } from "./firebase/config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { renderLanding } from "./ui/landing.js";

import { getUserData } from "./auth.js";

import { renderStudentDashboard } from "./student/dashboard.js";

import { logoutUser } from "./auth.js";

onAuthStateChanged(auth, async (user) => {
  console.log("Firebase User:", user);

  if (!user) {
    renderLanding();
    return;
  }

  console.log("UID:", user.uid);

  const userData = await getUserData(user.uid);

  renderStudentDashboard(userData);
});
