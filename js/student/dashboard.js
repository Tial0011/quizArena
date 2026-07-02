import { logoutUser } from "../auth.js";
import { renderPracticeArena } from "./practice.js";
import { renderMyQuizzes } from "./myQuizzes.js";

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
            📈 Recent Activity
          </h2>

        </div>

        <div class="empty-state">

          No quiz attempts yet.
          <br><br>
          Start practicing to see your progress here.

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
}

function setupDashboardEvents(userData) {
  document.getElementById("practiceBtn")?.addEventListener("click", () => {
    renderPracticeArena(userData);
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
