import { logoutUser } from "../auth.js";
import { renderPracticeArena } from "./practice.js";
import { renderMarketplace } from "./marketplace.js";
import { renderMyQuizzes } from "./myQuizzes.js";
import { getRecentAttempts } from "./attemptsService.js";
import {
  renderRecentAttemptsMarkup,
  renderScoreTrendChartMarkup,
} from "./analyticsWidgets.js";

const app = document.getElementById("app");

// Parallax uses a single persistent scroll listener — same
// reasoning as landing.js: renderStudentDashboard() can be
// called many times in a session (returning from Practice,
// Marketplace, etc.), and re-attaching a window-level scroll
// listener every time would stack up duplicates that never get
// cleaned up.
let parallaxInitialized = false;

export function renderStudentDashboard(userData = {}) {
  const purchasedCount = userData.purchasedQuizzes?.length || 0;

  app.innerHTML = `
    <div class="dashboard">

      <header class="dashboard-hero">

        <div class="dashboard-hero-shape dashboard-hero-shape-1" data-parallax-speed="0.1"></div>
        <div class="dashboard-hero-shape dashboard-hero-shape-2" data-parallax-speed="0.18"></div>

        <div class="hero-text">

          <h1>
            👋 Welcome Back${userData.name ? `, ${userData.name}` : ""}
          </h1>

          <p>
            Master one quiz today and keep your streak alive.
          </p>

        </div>

      </header>

      <section class="action-grid">

        <div
          class="action-card load-in"
          id="practiceBtn"
        >

          <div class="action-icon">
            🎯
          </div>

          <h3>
            Practice Arena
          </h3>

          <p>
            Practice questions from quizzes you've purchased with custom time and question limits.
          </p>

          <span class="action-link">
            Open →
          </span>

        </div>

        <div
          class="action-card load-in"
          id="marketplaceBtn"
        >

          <div class="action-icon">
            🛒
          </div>

          <h3>
            Marketplace
          </h3>

          <p>
            Browse available weekly quizzes and purchase new ones to expand your library.
          </p>

          <span class="action-link">
            Browse →
          </span>

        </div>

        <div
          class="action-card load-in"
          id="quizzesBtn"
        >

          <div class="action-icon">
            📚
          </div>

          <h3>
            My Quizzes
          </h3>

          <p>
            View and attempt your purchased weekly quizzes anytime.
          </p>

          <span class="action-link">
            Open →
          </span>

        </div>

      </section>

      <section class="stats-grid">

        <div class="stat-card load-in">

          <span class="stat-icon">
            📦
          </span>

          <h2 id="purchasedCountValue" data-count-target="${purchasedCount}">
            0
          </h2>

          <p>
            Purchased Quizzes
          </p>

        </div>

        <div class="stat-card load-in">

          <span class="stat-icon">
            🏆
          </span>

          <h2>
            --
          </h2>

          <p>
            Best Score
          </p>

        </div>

      </section>

      <section class="dashboard-section reveal" data-reveal>

        <div class="section-header">

          <h2>
            📊 Score Trend
          </h2>

        </div>

        <div id="scoreTrendContainer" class="score-trend-container">
          <p>Loading...</p>
        </div>

      </section>

      <section class="dashboard-section reveal" data-reveal>

        <div class="section-header">

          <h2>
            📈 Recent Activity
          </h2>

        </div>

        <div id="recentActivityContainer">
          <p>Loading...</p>
        </div>

      </section>

      <button
        id="logoutBtn"
        class="logout-btn"
      >
        Logout
      </button>

    </div>
  `;

  setupDashboardEvents(userData);
  initDashboardEffects();
  loadAnalytics(userData);
}

/* =========================================================
   ANALYTICS
   Loaded async after the initial render. Guarded against the
   student having already navigated to another page (Practice,
   Marketplace, etc.) by the time the Firestore read finishes —
   same class of bug fixed earlier in the admin dashboard, where
   a stale async load tried to write into DOM nodes that had
   already been replaced.
========================================================= */
async function loadAnalytics(userData) {
  const attempts = await getRecentAttempts(userData.id, 10);

  const trendContainer = document.getElementById("scoreTrendContainer");
  const activityContainer = document.getElementById("recentActivityContainer");

  if (trendContainer) {
    trendContainer.innerHTML = renderScoreTrendChartMarkup(attempts);
  }

  if (activityContainer) {
    activityContainer.innerHTML = renderRecentAttemptsMarkup(attempts);
  }
}

function setupDashboardEvents(userData) {
  document.getElementById("practiceBtn")?.addEventListener("click", () => {
    renderPracticeArena(userData);
  });

  document.getElementById("marketplaceBtn")?.addEventListener("click", () => {
    renderMarketplace(userData);
  });

  document.getElementById("quizzesBtn")?.addEventListener("click", () => {
    renderMyQuizzes(userData);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    const confirmLogout = confirm("Are you sure you want to logout?");

    if (!confirmLogout) return;

    await logoutUser();
  });
}

/* =========================================================
   VISUAL EFFECTS
   Pure CSS + vanilla JS, same principles as the landing page:
   - Parallax is desktop-only work (skipped outright on mobile,
     not just hidden by CSS, to save battery/CPU where most
     visitors actually are).
   - Card tilt is desktop-only (matches devices that actually
     have a mouse to tilt with).
   - Scroll-reveal and the count-up both work everywhere — they
     don't cost much and read fine on any screen size.
   - Everything respects prefers-reduced-motion.
========================================================= */
function initDashboardEffects() {
  initParallax();
  initScrollReveal();
  initCardTilt();
  initCountUp();
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function initParallax() {
  if (parallaxInitialized) return;
  parallaxInitialized = true;

  if (prefersReducedMotion()) return;

  let ticking = false;

  function updateParallax() {
    if (window.innerWidth < 768) {
      ticking = false;
      return;
    }

    const scrollY = window.scrollY;

    document.querySelectorAll("[data-parallax-speed]").forEach((shape) => {
      const speed = parseFloat(shape.dataset.parallaxSpeed) || 0.12;
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
 * Fades/slides [data-reveal] sections in once scrolled into
 * view — mainly the Score Trend and Recent Activity sections,
 * which often sit below the fold, especially on mobile.
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
 * Subtle 3D tilt on the action cards, following the cursor.
 * Desktop only — touch devices don't fire mousemove anyway, but
 * the width check keeps this from doing any work at all on
 * mobile rather than relying on that alone.
 */
function initCardTilt() {
  if (prefersReducedMotion()) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  document.querySelectorAll(".action-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -3;
      const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 3;

      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/**
 * Animates the "Purchased Quizzes" number counting up from 0 to
 * its real value — a small Duolingo-style touch (their XP/streak
 * counters do the same). Skipped entirely under reduced motion,
 * where the target value is just shown immediately.
 */
function initCountUp() {
  const el = document.getElementById("purchasedCountValue");
  if (!el) return;

  const target = Number(el.dataset.countTarget) || 0;

  if (prefersReducedMotion() || target === 0) {
    el.textContent = target;
    return;
  }

  const durationMs = 700;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / durationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(eased * target);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}
