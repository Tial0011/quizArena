import { auth } from "./firebase/config.js";

import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { renderLanding } from "./ui/landing.js";

/* =========================================================
   AUTO-LOGIN DISABLED

   Firebase Auth persists a signed-in session across page
   reloads by default. This app intentionally does NOT want
   that: every fresh page load should show the login screen,
   even if a previous session is still valid.

   onAuthStateChanged still fires once on load with whatever
   session Firebase restored — if there is one, it's signed out
   immediately, then the landing page renders either way.

   After this first check, the listener unsubscribes itself.
   It has nothing left to do: a successful login is handled
   directly by submitForm() in landing.js, which already routes
   to the right dashboard without needing this listener to fire
   again.
========================================================= */
const unsubscribe = onAuthStateChanged(auth, async (user) => {
  unsubscribe();

  if (user) {
    await signOut(auth);
  }

  renderLanding();
});
