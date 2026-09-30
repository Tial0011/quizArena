import { renderSubjects } from "./subjects.js";
import { renderQuizzes } from "./quizzes.js";
import { renderQuestions } from "./questions.js";
import { renderNotifications } from "./notifications.js";
import { logoutUser } from "../auth.js";
import { db } from "../firebase/config.js";
import { initParallax, initScrollReveal } from "../student/scrollEffects.js";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = document.getElementById("app");

let activeTab = "dashboard";

// Icon + copy for each activity source. Keyed by the same "type"
// tag pushed onto events in loadRecentActivity() below.
const ACTIVITY_META = {
  subject: { icon: "📚", verb: "New subject added" },
  quiz: { icon: "📝", verb: "New quiz created" },
  question: { icon: "❓", verb: "New question added" },
};

export function renderAdminDashboard() {
  app.innerHTML = `
    <div class="admin-wrap">

      <header class="admin-header">

        <div class="admin-header-shape admin-header-shape-1" data-parallax-speed="0.1"></div>
        <div class="admin-header-shape admin-header-shape-2" data-parallax-speed="0.18"></div>

        <img
          src="../../icons/icon-192.png"
          alt="Quiz Arena"
          class="admin-logo"
        />

        <div class="admin-header-text">
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

        <button
          class="tab-btn ${activeTab === "notifications" ? "active" : ""}"
          data-tab="notifications"
        >
          Notifications
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

          <div class="activity-list" id="activityList">
            <div class="activity-item activity-item-loading">
              Loading recent activity…
            </div>
          </div>

        </div>
      `;

      // Re-run reveal/parallax now that this tab's markup (with its
      // own .reveal / data-parallax-speed nodes) exists in the DOM.
      initAdminEffects();

      await Promise.all([loadDashboardStats(), loadRecentActivity()]);

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

    case "notifications":
      renderNotifications(content);
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
  // (it now holds Subjects/Quizzes/Questions/Notifications instead).
  // Bail out here instead of trying to write into elements that
  // don't exist anymore.
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

// Pulls the most recent few subjects/quizzes/questions (by createdAt)
// and merges them into a single feed. There's no dedicated "activity
// log" collection — this is a fan-out read across the three content
// collections rather than a stored event stream, so it costs 3 reads
// (well, 3 queries of `limit` docs each) per dashboard visit. Fine at
// current scale; if it ever needs to scale up, a written activity-log
// collection would be the next step instead of widening these limits.
async function loadRecentActivity() {
  const FETCH_LIMIT = 5;
  const DISPLAY_LIMIT = 6;

  let subjectSnap, quizSnap, questionSnap;

  try {
    [subjectSnap, quizSnap, questionSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "subjects"),
          orderBy("createdAt", "desc"),
          limit(FETCH_LIMIT),
        ),
      ),
      getDocs(
        query(
          collection(db, "quizzes"),
          orderBy("createdAt", "desc"),
          limit(FETCH_LIMIT),
        ),
      ),
      getDocs(
        query(
          collection(db, "questions"),
          orderBy("createdAt", "desc"),
          limit(FETCH_LIMIT),
        ),
      ),
    ]);
  } catch (err) {
    console.error("Failed to load recent activity:", err);

    if (activeTab === "dashboard") {
      renderActivityList([], "Couldn't load recent activity right now.");
    }

    return;
  }

  // Same tab-switch race as loadDashboardStats() above — bail if
  // #activityList no longer exists.
  if (activeTab !== "dashboard") return;

  const events = [
    ...subjectSnap.docs.map((docSnap) =>
      toActivityEvent("subject", docSnap.data()),
    ),
    ...quizSnap.docs.map((docSnap) => toActivityEvent("quiz", docSnap.data())),
    ...questionSnap.docs.map((docSnap) =>
      toActivityEvent("question", docSnap.data()),
    ),
  ];

  events.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  renderActivityList(events.slice(0, DISPLAY_LIMIT));
}

function toActivityEvent(type, data) {
  const meta = ACTIVITY_META[type];

  const label =
    type === "question"
      ? truncate(data.text ?? data.question ?? "Untitled question", 60)
      : (data.title ?? data.name ?? `Untitled ${type}`);

  return {
    type,
    createdAt: data.createdAt,
    text: `${meta.verb}: ${label}`,
  };
}

function renderActivityList(events, emptyMessage) {
  const listEl = document.getElementById("activityList");
  if (!listEl) return;

  if (events.length === 0) {
    listEl.innerHTML = `<div class="activity-item">${
      emptyMessage ??
      "No activity yet — create a subject, quiz or question to get started."
    }</div>`;
    return;
  }

  listEl.innerHTML = events
    .map(
      (event) => `
        <div class="activity-item">
          <span class="activity-icon">${ACTIVITY_META[event.type].icon}</span>
          <span class="activity-text">${escapeHtml(event.text)}</span>
          <span class="activity-time">${formatRelativeTime(event.createdAt)}</span>
        </div>
      `,
    )
    .join("");
}

function toMillis(timestamp) {
  return timestamp?.toMillis ? timestamp.toMillis() : 0;
}

function formatRelativeTime(timestamp) {
  if (!timestamp?.toDate) return "";

  const diffMs = Date.now() - timestamp.toDate().getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return timestamp.toDate().toLocaleDateString();
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setStatText(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = value;
  }
}
