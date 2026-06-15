import { logoutUser } from "../auth.js";
import { renderPracticeArena } from "./practice.js";
const app = document.getElementById("app");
export function renderStudentDashboard(userData = {}) {
  app.innerHTML = `
    <div class="dashboard">

      <header class="dashboard-header">
        <h1>
          Welcome${userData.name ? `, ${userData.name}` : ""} 👋
        </h1>

        <p>
          Ready to practice today?
        </p>
      </header>

      <section class="quick-actions">

        <button
          class="action-card"
          id="practiceBtn"
        >
          <h3>🎯 Practice Arena</h3>

          <p>
            Create custom quizzes by
            subject, time and question count.
          </p>
        </button>

        <button
          class="action-card"
          id="quizzesBtn"
        >
          <h3>📚 My Quizzes</h3>

          <p>
            Access your purchased
            weekly quizzes.
          </p>
        </button>

      </section>

      <section class="dashboard-section">

        <div class="section-header">
          <h2>Recent Results</h2>
        </div>

        <div id="resultsList">

          <div class="empty-state">
            No quiz attempts yet.
          </div>

        </div>

      </section>

      <section class="dashboard-section">

        <div class="section-header">
          <h2>Purchased Quizzes</h2>
        </div>

        <div id="purchasedList">

          <div class="empty-state">
            No purchased quizzes yet.
          </div>

        </div>

      </section>

    </div>
    <button id="logoutBtn">
  Logout
</button>
  `;

  setupDashboardEvents();
}
function setupDashboardEvents() {
  document.getElementById("practiceBtn")?.addEventListener("click", () => {
    renderPracticeArena();
  });

  document.getElementById("quizzesBtn")?.addEventListener("click", () => {
    console.log("Open My Quizzes");
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await logoutUser();
  });
}
