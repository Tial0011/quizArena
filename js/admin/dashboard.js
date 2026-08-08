import { renderSubjects } from "./subjects.js";
import { renderQuizzes } from "./quizzes.js";
import { renderQuestions } from "./questions.js";
import { logoutUser } from "../auth.js";
import { db } from "../firebase/config.js";
import { initParallax, initScrollReveal } from "../student/scrollEffects.js";

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
    <div class="admin-wrap">

      <header class="admin-header">

        <div class="admin-header-shape admin-header-shape-1" data-parallax-speed="0.1"></div>
        <div class="admin-header-shape admin-header-shape-2" data-parallax-speed="0.18"></div>

        <div>
          <span class="admin-eyebrow">Administration Console</span>
          <h1>Quiz Arena Admin</h1>
          <p>Manage quizzes, subjects and students.</p>
        </div>

        <button id="adminLogoutBtn" class="admin-logout-btn">
          Logout
        </button>

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
  setupLogout();
  initAdminEffects();
}

function initAdminEffects() {
  initParallax();
  initScrollReveal();
}

function setupLogout() {
  document
    .getElementById("adminLogoutBtn")
    ?.addEventListener("click", async () => {
      const confirmLogout = confirm("Are you sure you want to logout?");

      if (!confirmLogout) return;

      await logoutUser();
    });
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
        <div class="admin-card load-in">

          <h2>Overview</h2>
          <p>Welcome back! Here's what's happening today.</p>

          <div class="overview-grid">

            <div class="overview-card load-in">
              <div class="overview-icon">📚</div>
              <div class="overview-info">
                <h3 id="subjectCount">--</h3>
                <p>Subjects</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">📝</div>
              <div class="overview-info">
                <h3 id="quizCount">--</h3>
                <p>Weekly Quizzes</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">❓</div>
              <div class="overview-info">
                <h3 id="questionCount">--</h3>
                <p>Questions</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">👨‍🎓</div>
              <div class="overview-info">
                <h3 id="studentCount">--</h3>
                <p>Students</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">💰</div>
              <div class="overview-info">
                <h3 id="revenueTotal">--</h3>
                <p>Total Revenue</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">🔥</div>
              <div class="overview-info">
                <h3 id="topQuizName" class="overview-info-topquiz">--</h3>
                <p>Top Selling Quiz</p>
              </div>
            </div>

          </div>

        </div>

        <div class="admin-card reveal" data-reveal>

          <h2>Recent Activity</h2>

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

      // Re-run reveal/parallax now that this tab's markup (with its
      // own .reveal / data-parallax-speed nodes) exists in the DOM.
      initAdminEffects();

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

  const purchaseSnap = await getDocs(
    query(collection(db, "purchases"), where("status", "==", "paid")),
  );

  // If the admin switched to a different tab while these reads were
  // in flight, #adminContent no longer contains the dashboard markup
  // (it now holds Subjects/Quizzes/Questions instead). Bail out here
  // instead of trying to write into elements that don't exist anymore.
  if (activeTab !== "dashboard") return;

  setStatText("subjectCount", subjectSnap.size);
  setStatText("quizCount", quizSnap.size);
  setStatText("questionCount", questionSnap.size);
  setStatText("studentCount", studentSnap.size);

  // Purchases don't store the price paid, so revenue/top-quiz are
  // computed by joining each paid purchase back to its quiz's
  // *current* price/title. If a quiz's price changes after a sale,
  // past revenue reflects the new price, not what was actually paid —
  // fine for a rough "how are we doing" number, but call this out if
  // it ever needs to be exact (would mean storing amount on the
  // purchase doc at write time instead).
  const quizById = {};
  quizSnap.forEach((docSnap) => {
    quizById[docSnap.id] = docSnap.data();
  });

  let totalRevenue = 0;
  const salesByQuizId = {};

  purchaseSnap.forEach((docSnap) => {
    const { quizId } = docSnap.data();
    const quiz = quizById[quizId];

    totalRevenue += quiz?.price ?? 0;
    salesByQuizId[quizId] = (salesByQuizId[quizId] ?? 0) + 1;
  });

  setStatText("revenueTotal", `₦${totalRevenue.toLocaleString()}`);

  const topEntry = Object.entries(salesByQuizId).sort(
    ([, a], [, b]) => b - a,
  )[0];

  const topQuizEl = document.getElementById("topQuizName");
  if (topQuizEl) {
    topQuizEl.textContent = topEntry
      ? (quizById[topEntry[0]]?.title ?? "Unknown quiz")
      : "No sales yet";
  }
}

function setStatText(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = value;
  }
}
