import { renderSubjects } from "./subjects.js";
import { renderQuizzes } from "./quizzes.js";
import { renderQuestions } from "./questions.js";

const app = document.getElementById("app");

let activeTab = "dashboard";

export function renderAdminDashboard() {
  app.innerHTML = `
    <div class="admin-container">

      <header class="admin-header">
        <div>
          <h1>Quiz Arena Admin</h1>
          <p>Manage quizzes, subjects and questions</p>
        </div>
      </header>

      <nav class="admin-tabs">

        <button
          class="tab-btn ${activeTab === "dashboard" ? "active" : ""}"
          data-tab="dashboard"
        >
          Dashboard
        </button>

        <button
          class="tab-btn ${activeTab === "subjects" ? "active" : ""}"
          data-tab="subjects"
        >
          Subjects
        </button>

        <button
          class="tab-btn ${activeTab === "quizzes" ? "active" : ""}"
          data-tab="quizzes"
        >
          Quizzes
        </button>

        <button
          class="tab-btn ${activeTab === "questions" ? "active" : ""}"
          data-tab="questions"
        >
          Questions
        </button>

      </nav>

      <main id="adminContent"></main>

    </div>
  `;

  setupTabs();
  renderTabContent();
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderAdminDashboard();
    });
  });
}

function renderTabContent() {
  const content = document.getElementById("adminContent");

  switch (activeTab) {
    case "dashboard":
      content.innerHTML = `
        <div class="admin-card">

          <h2>Overview</h2>

          <p>
            Welcome to Quiz Arena Admin Panel.
          </p>

          <div class="overview-grid">

            <div class="overview-item">
              <h3>Subjects</h3>
              <span>📚</span>
            </div>

            <div class="overview-item">
              <h3>Quizzes</h3>
              <span>📝</span>
            </div>

            <div class="overview-item">
              <h3>Questions</h3>
              <span>❓</span>
            </div>

          </div>

        </div>
      `;
      break;

    case "subjects":
      renderSubjects(content);
      break;

    case "quizzes":
      renderQuizzes(content);
      break;

    case "questions":
      renderQuestions(content);
      break;
  }
}
