import { renderStudentDashboard } from "../student/dashboard.js";
import { loginUser, registerUser, getUserData } from "../auth.js";
import { renderAdminDashboard } from "../admin/dashboard.js";
const app = document.getElementById("app");

let mode = "login";

// Parallax uses a single persistent scroll listener (see
// initParallax) rather than re-attaching one on every render —
// this flag makes sure it's only ever set up once.
let parallaxInitialized = false;

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
          Practice Physics, Biology,
          Chemistry and Statistics with
          weekly quizzes designed for
          serious students.
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
    </div>

    <button id="submitBtn" class="submit-btn">
      Log In
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

  const ADMIN_EMAIL = "admin@test.com";

  if (result.user.email === ADMIN_EMAIL) {
    renderAdminDashboard();
  } else {
    const userData = await getUserData(result.user.uid);

    renderStudentDashboard(userData);
  }
}

/* =========================================================
   SCROLL EFFECTS
   Pure CSS + vanilla JS — no animation library. Three pieces:
   parallax background shapes, scroll-triggered section reveals,
   and a 3D mouse-tilt on the auth card. All respect
   prefers-reduced-motion.
========================================================= */
function initScrollEffects() {
  initParallax();
  initScrollReveal();
  initCardTilt();
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Background shapes drift upward at different speeds as the
 * page scrolls, based on each element's data-parallax-speed.
 *
 * Only ever attaches ONE scroll listener, ever — renderLanding()
 * can be called many times in a session (e.g. toggling between
 * Login/Register re-renders the whole page), and re-attaching a
 * window-level scroll listener on every render would stack up
 * duplicates that never get cleaned up. The listener re-queries
 * the DOM fresh on every tick instead of caching elements, so it
 * always targets whatever's currently on the page.
 */
function initParallax() {
  if (parallaxInitialized) return;
  parallaxInitialized = true;

  if (prefersReducedMotion()) return;

  let ticking = false;

  function updateParallax() {
    // Parallax is a desktop-only flourish. On mobile, skip the
    // work entirely rather than computing and writing styles
    // that CSS then hides anyway — this is scroll-linked code,
    // so avoiding unnecessary work here matters for battery/CPU
    // on phones, where most visitors actually are.
    if (window.innerWidth < 768) {
      ticking = false;
      return;
    }

    const scrollY = window.scrollY;

    document.querySelectorAll("[data-parallax-speed]").forEach((shape) => {
      const speed = parseFloat(shape.dataset.parallaxSpeed) || 0.15;
      shape.style.transform = `translateY(${scrollY * speed}px)`;
    });

    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    },
    { passive: true },
  );
}

/**
 * Fades/slides each [data-reveal] element in once it scrolls
 * into view. Safe to call on every render — each call creates a
 * fresh observer scoped to that render's elements, and the old
 * observer (along with its now-detached target elements) is
 * simply garbage collected once nothing references it anymore.
 */
function initScrollReveal() {
  const revealEls = document.querySelectorAll("[data-reveal]");
  if (!revealEls.length) return;

  if (prefersReducedMotion()) {
    revealEls.forEach((el) => el.classList.add("reveal-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );

  revealEls.forEach((el) => observer.observe(el));
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
