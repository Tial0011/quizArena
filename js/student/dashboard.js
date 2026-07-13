import { logoutUser } from "../auth.js";
import { renderPracticeArena } from "./practice.js";
import { renderMarketplace } from "./marketplace.js";
import { renderMyQuizzes } from "./myQuizzes.js";
import { renderFriendGroups } from "./friendGroups.js";
import { getRecentAttempts } from "./attemptsService.js";
import {
  renderRecentAttemptsMarkup,
  renderScoreTrendChartMarkup,
} from "./analyticsWidgets.js";
import {
  prefersReducedMotion,
  initScrollReveal,
  initParallax,
  animateCountUp,
} from "./scrollEffects.js";

const app = document.getElementById("app");

const DEFAULT_HERO_MESSAGE =
  "Master one quiz today and keep your streak alive.";

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

          <p id="heroMessage">
            ${DEFAULT_HERO_MESSAGE}
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

        <div
          class="action-card load-in"
          id="friendGroupsBtn"
        >

          <div class="action-icon">
            🏆
          </div>

          <h3>
            Friend Groups
          </h3>

          <p>
            Create or join a squad and see who tops the leaderboard.
          </p>

          <span class="action-link">
            Compete →
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
  const heroMessage = document.getElementById("heroMessage");

  if (trendContainer) {
    trendContainer.innerHTML = renderScoreTrendChartMarkup(attempts);
  }

  if (activityContainer) {
    activityContainer.innerHTML = renderRecentAttemptsMarkup(attempts);
  }

  if (heroMessage) {
    updateHeroMessage(heroMessage, attempts);
  }
}

/**
 * Storytelling: the hero message adapts to what the student has
 * actually been doing, using the same attempts data already
 * fetched for the score trend — first quiz, on a streak, or a
 * gentle nudge to keep practicing, instead of one static line
 * every time.
 */
function updateHeroMessage(el, attempts) {
  const message = pickHeroMessage(attempts);
  if (message === DEFAULT_HERO_MESSAGE) return;

  if (prefersReducedMotion()) {
    el.textContent = message;
    return;
  }

  el.classList.add("message-updating");
  setTimeout(() => {
    el.textContent = message;
    el.classList.remove("message-updating");
  }, 300);
}

function pickHeroMessage(attempts) {
  if (!attempts || attempts.length === 0) {
    return "Ready to take your first quiz? Let's get started 🚀";
  }

  if (attempts.length === 1) {
    return "Nice start! Keep going to build your streak 💪";
  }

  const [latest, previous] = attempts;
  if (latest.percentage > previous.percentage) {
    return "You're on a roll — your scores are trending up 🔥";
  }

  if (latest.percentage === previous.percentage) {
    return "Staying consistent — keep that momentum going 📈";
  }

  return "Every attempt makes you sharper — let's practice more 💪";
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

  document.getElementById("friendGroupsBtn")?.addEventListener("click", () => {
    renderFriendGroups(userData);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    const confirmLogout = confirm("Are you sure you want to logout?");

    if (!confirmLogout) return;

    await logoutUser();
  });
}

/* =========================================================
   VISUAL EFFECTS
   Reveal, parallax, and count-up now live in the shared
   scrollEffects.js module (also used by landing.js) — no longer
   duplicated here. Only the action-card 3D tilt is
   dashboard-specific, so it stays local.
========================================================= */
function initDashboardEffects() {
  initParallax();
  initScrollReveal();
  initCardTilt();

  const countEl = document.getElementById("purchasedCountValue");
  if (countEl) {
    animateCountUp(countEl, Number(countEl.dataset.countTarget) || 0);
  }
}

/**
 * Subtle 3D tilt on the action cards, following the cursor.
 * Desktop only — touch devices don't fire mousemove anyway, but
 * the capability check keeps this from doing any work at all on
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
