import { renderSubjects } from "./subjects.js";
import { renderQuizzes } from "./quizzes.js";
import { renderQuestions } from "./questions.js";

import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = document.getElementById("app");

let activeTab = "dashboard";

export function renderAdminDashboard() {
  app.innerHTML = `
    <div class="admin-container">

      <header class="admin-header">

        <div>
          <h1>Quiz Arena Admin</h1>
          <p>
            Manage quizzes, subjects and students.
          </p>
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

async function renderTabContent() {
  const content = document.getElementById("adminContent");

  switch (activeTab) {
    case "dashboard":
      content.innerHTML = `
        <div class="admin-card">

          <h2>
            Overview
          </h2>

          <p>
            Welcome back! Here's what's happening today.
          </p>

          <div class="overview-grid">

            <div class="overview-card">

              <div class="overview-icon">
                📚
              </div>

              <div class="overview-info">

                <h3 id="subjectCount">
                  --
                </h3>

                <p>
                  Subjects
                </p>

              </div>

            </div>

            <div class="overview-card">

              <div class="overview-icon">
                📝
              </div>

              <div class="overview-info">

                <h3 id="quizCount">
                  --
                </h3>

                <p>
                  Weekly Quizzes
                </p>

              </div>

            </div>

            <div class="overview-card">

              <div class="overview-icon">
                ❓
              </div>

              <div class="overview-info">

                <h3 id="questionCount">
                  --
                </h3>

                <p>
                  Questions
                </p>

              </div>

            </div>

            <div class="overview-card">

              <div class="overview-icon">
                👨‍🎓
              </div>

              <div class="overview-info">

                <h3 id="studentCount">
                  --
                </h3>

                <p>
                  Students
                </p>

              </div>

            </div>

          </div>

        </div>

        <div class="admin-card">

          <h2>
            Recent Activity
          </h2>

          <div class="activity-list">

            <div class="activity-item">
              🚀 Quiz Arena Admin is ready.
            </div>

            <div class="activity-item">
              Create subjects, quizzes and questions to get started.
            </div>

          </div>

        </div>
      `;

      await loadDashboardStats();

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

async function loadDashboardStats() {
  const subjectSnap = await getDocs(collection(db, "subjects"));

  const quizSnap = await getDocs(collection(db, "quizzes"));

  const questionSnap = await getDocs(collection(db, "questions"));

  const studentSnap = await getDocs(
    query(collection(db, "users"), where("role", "==", "student")),
  );

  document.getElementById("subjectCount").textContent = subjectSnap.size;

  document.getElementById("quizCount").textContent = quizSnap.size;

  document.getElementById("questionCount").textContent = questionSnap.size;

  document.getElementById("studentCount").textContent = studentSnap.size;
}
