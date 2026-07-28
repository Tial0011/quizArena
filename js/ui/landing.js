import { renderStudentDashboard } from "../student/dashboard.js";
import { startSessionManager } from "../sessionManager.js";
import {
  loginUser,
  registerUser,
  getUserData,
  signInWithGoogle,
  resetPassword,
} from "../auth.js";
import { renderAdminDashboard } from "../admin/dashboard.js";
import {
  prefersReducedMotion,
  initScrollReveal,
  initParallax,
} from "../student/scrollEffects.js";
const app = document.getElementById("app");

let mode = "login";

export function renderLanding() {
  app.innerHTML = `
    <div class="page">

      <section class="hero">

        <div class="hero-parallax-shape hero-parallax-shape-1" data-parallax-speed="0.15"></div>
        <div class="hero-parallax-shape hero-parallax-shape-2" data-parallax-speed="0.3"></div>

        <div class="live-badge">
          Live Platform
        </div>

        <div class="logo">
          Quiz Arena
        </div>

        <h1>
          Master Your Subjects.<br>
          One Quiz at a Time.
        </h1>

        <p>
Quiz Arena helps UNIMED students prepare for 100 Level courses with timed CBT practice, topic-based quizzes and exam-style questions.
</p>

        <div class="stats">
          <div class="stat">
            <h3>5</h3>
            <span>Subjects</span>
          </div>

          <div class="stat">
            <h3>∞</h3>
            <span>Practice</span>
          </div>

          <div class="stat">
            <h3>24/7</h3>
            <span>Access</span>
          </div>
        </div>

      </section>

      <section class="auth-card" id="authCard">

        ${mode === "login" ? loginMarkup() : registerMarkup()}

      </section>

    </div>

    <!-- ==============================================
         STORY: why the platform exists / what it offers.
         Lives below the login fold, revealed as the visitor
         scrolls down.
    =============================================== -->
    <section class="story-section">

      <div class="story-parallax-shape story-parallax-shape-1" data-parallax-speed="0.1"></div>

      <div class="story-content reveal" data-reveal>
        <span class="story-eyebrow">Why students choose us</span>
        <h2>Built for how you actually study</h2>
        <p>
          Every quiz is timed, randomized and structured around your
          real class curriculum — so practice always feels like the
          real thing.
        </p>
      </div>

      <div class="story-features">

        <div class="story-feature-card reveal" data-reveal>
          <div class="story-feature-icon">🎯</div>
          <h3>Focused Practice</h3>
          <p>
            Pick your subject, question count and time limit —
            practice exactly the way you want.
          </p>
        </div>

        <div class="story-feature-card reveal" data-reveal>
          <div class="story-feature-icon">⏱️</div>
          <h3>Real Exam Conditions</h3>
          <p>
            Purchased quizzes run as a timed, randomized CBT —
            just like the real thing.
          </p>
        </div>

        <div class="story-feature-card reveal" data-reveal>
          <div class="story-feature-icon">📈</div>
          <h3>Track Your Growth</h3>
          <p>
            See your score trend and recent activity, so you
            always know where you stand.
          </p>
        </div>

      </div>

    </section>

    <!-- ==============================================
         STORY: closing CTA
    =============================================== -->
    <section class="story-cta">
      <div class="story-cta-content reveal" data-reveal>
        <h2>Ready to start?</h2>
        <p>Create your free account and take your first quiz in minutes.</p>
      </div>
    </section>
  `;

  attachEvents();
  initScrollEffects();
}

function googleButtonMarkup() {
  return `
    <div class="auth-divider">
      <span>or</span>
    </div>

    <button type="button" id="googleSignInBtn" class="google-btn">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
      </svg>
      Continue with Google
    </button>
  `;
}

function loginMarkup() {
  return `
    <h2>Welcome Back</h2>
    <p class="auth-subtitle">Enter your email and password to continue</p>

    <div class="form-group">
      <label for="email">Email</label>
      <div class="input-with-icon">
        <span class="input-icon">✉️</span>
        <input
          id="email"
          type="email"
          placeholder="e.g. arjun@email.com"
        >
      </div>
    </div>

    <div class="form-group">
      <label for="password">Password</label>
      <div class="input-with-icon">
        <span class="input-icon">🔒</span>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
        >
      </div>
      <p class="forgot-password">
        <span id="forgotPasswordLink">Forgot password?</span>
      </p>
    </div>

    ${googleButtonMarkup()}

    <button id="submitBtn" class="submit-btn">
      Sign In
    </button>

    <p class="switch">
      Don't have an account?

      <span id="switchMode">
        Register
      </span>
    </p>
  `;
}

function registerMarkup() {
  return `
    <h2>Create Account</h2>
    <p class="auth-subtitle">Set up your details to get started</p>

    <div class="form-group">
      <label for="name">Full Name</label>
      <div class="input-with-icon">
        <span class="input-icon">👤</span>
        <input
          id="name"
          placeholder="e.g. Arjun Sharma"
        >
      </div>
    </div>

    <div class="form-group">
      <label for="email">Email</label>
      <div class="input-with-icon">
        <span class="input-icon">✉️</span>
        <input
          id="email"
          type="email"
          placeholder="e.g. arjun@email.com"
        >
      </div>
    </div>

    <div class="form-group">
      <label for="password">Password</label>
      <div class="input-with-icon">
        <span class="input-icon">🔒</span>
        <input
          id="password"
          type="password"
          placeholder="Create a password"
        >
      </div>
    </div>

    ${googleButtonMarkup()}

    <button id="submitBtn" class="submit-btn">
      Register
    </button>

    <p class="switch">
      Already have an account?

      <span id="switchMode">
        Login
      </span>
    </p>
  `;
}

function attachEvents() {
  document.getElementById("switchMode")?.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";

    renderLanding();
  });

  document.getElementById("submitBtn")?.addEventListener("click", submitForm);
  document
    .getElementById("googleSignInBtn")
    ?.addEventListener("click", handleGoogleSignIn);
  document
    .getElementById("forgotPasswordLink")
    ?.addEventListener("click", handleForgotPassword);
}

async function submitForm() {
  const submitBtn = document.getElementById("submitBtn");

  submitBtn.disabled = true;
  submitBtn.textContent = "Loading...";
  const email = document.getElementById("email").value;

  const password = document.getElementById("password").value;

  let result;

  if (mode === "register") {
    const name = document.getElementById("name").value;

    result = await registerUser(name, email, password);
  } else {
    result = await loginUser(email, password);
  }

  if (!result.success) {
    alert(result.message);
    submitBtn.disabled = false;

    submitBtn.textContent = mode === "login" ? "Sign In" : "Register";
    return;
  }

  await routeAfterAuth(result.user);
}

/**
 * Google Sign-In handles both login and registration in one
 * action, so this doesn't branch on `mode` the way submitForm()
 * does — it just signs in (creating the account if new) and
 * routes.
 */
async function handleGoogleSignIn() {
  const btn = document.getElementById("googleSignInBtn");
  btn.disabled = true;

  const result = await signInWithGoogle();

  if (!result.success) {
    btn.disabled = false;
    alert(result.message);
    return;
  }

  await routeAfterAuth(result.user);
}

async function handleForgotPassword() {
  const emailInput = document.getElementById("email");
  const email = emailInput?.value.trim();

  if (!email) {
    alert('Enter your email above first, then click "Forgot password?" again.');
    emailInput?.focus();
    return;
  }

  const confirmed = confirm(
    `A password reset link will be sent to ${email}. Check your spam box if not seen or contact the admin`,
  );
  if (!confirmed) return;

  const result = await resetPassword(email);
  alert(result.message);
}

/**
 * Shared by submitForm() and handleGoogleSignIn() — both need
 * the identical admin-vs-student routing decision after a
 * successful sign-in, so it lives in one place rather than
 * being duplicated.
 */
async function routeAfterAuth(user) {
  const ADMIN_EMAIL = "admin@test.com";

  // Start inactivity tracking
  startSessionManager();

  if (user.email === ADMIN_EMAIL) {
    renderAdminDashboard();
  } else {
    const userData = await getUserData(user.uid);

    renderStudentDashboard(userData);
  }
}

/* =========================================================
   SCROLL EFFECTS
   Reveal + parallax now live in the shared scrollEffects.js
   module (see import above). Only the 3D auth-card tilt is
   landing-page-specific, so it stays here.
========================================================= */
function initScrollEffects() {
  initParallax();
  initScrollReveal();
  initCardTilt();
}

/**
 * Subtle 3D tilt on the auth card, following the cursor.
 * Desktop only (matches the 900px breakpoint where the card
 * sits beside the hero) — safe to re-run every render since the
 * listeners are attached directly to #authCard, which gets
 * replaced (and its old listeners GC'd with it) on every render.
 */
function initCardTilt() {
  const card = document.getElementById("authCard");
  if (!card) return;

  if (prefersReducedMotion()) return;
  if (!window.matchMedia("(min-width: 900px)").matches) return;

  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -4;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 4;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
  });
}
