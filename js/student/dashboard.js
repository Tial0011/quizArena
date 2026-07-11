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

export function renderStudentDashboard(userData = {}) {
  const purchasedCount = userData.purchasedQuizzes?.length || 0;

  app.innerHTML = `
    <div class="dashboard">

      <header class="dashboard-hero">

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
          class="action-card"
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
          class="action-card"
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
          class="action-card"
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

        <div class="stat-card">

          <span class="stat-icon">
            📦
          </span>

          <h2>
            ${purchasedCount}
          </h2>

          <p>
            Purchased Quizzes
          </p>

        </div>

        <div class="stat-card">

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

      <section class="dashboard-section">

        <div class="section-header">

          <h2>
            📊 Score Trend
          </h2>

        </div>

        <div id="scoreTrendContainer" class="score-trend-container">
          <p>Loading...</p>
        </div>

      </section>

      <section class="dashboard-section">

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
