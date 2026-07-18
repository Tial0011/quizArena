import { db } from "../firebase/config.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { startPurchasedQuiz } from "./purchasedQuiz.js";
import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";
import { showLoadingOverlay } from "./loadingOverlay.js"; // ✅ added
let purchasedQuizzes = [];
let currentUserData = null;
let selectedSemester = "All";
let selectedSubject = "All";

export async function renderMyQuizzes(userData = {}) {
  currentUserData = userData;
  history.pushState(
    {
      page: "myQuizzes",
    },
    "",
    "",
  );
  const app = document.getElementById("app");
  registerBackHandler(() => {
    renderStudentDashboard(userData);
  });
  app.innerHTML = `
    <div class="dashboard">
<header class="dashboard-header">

  <h1>📚 My Quizzes</h1>

  <p>Access and attempt your purchased weekly quizzes.</p>

  <div class="my-quizzes-toolbar">
    <input
      type="text"
      id="myQuizSearch"
      class="my-quizzes-search"
      placeholder="Search by title, subject or week..."
    />

    <div id="myQuizSemesterFilter" class="my-quizzes-semester-filter"></div>
  </div>

  <div id="myQuizSubjectFilter" class="my-quizzes-subject-filter"></div>

</header>
<div id="myQuizSummary" class="my-quizzes-summary"></div>
      <div id="myQuizList"></div>

    </div>
  `;
  const container = document.getElementById("myQuizList");

  // ✅ Show spinner overlay instead of plain text
  const stopLoading = showLoadingOverlay(
    container,
    [
      "Loading your quizzes...",
      "Fetching purchase records...",
      "Preparing quiz cards...",
      "Almost ready...",
    ],
    { subtitle: "This usually takes just a moment" },
  );

  const purchases = userData?.purchasedQuizzes || [];

  if (purchases.length === 0) {
    stopLoading(); // remove overlay
    container.innerHTML = `
      <div class="empty-state">

        <h3>No Purchased Quizzes</h3>

        <p>
          Once you purchase a weekly quiz, it will appear here.
        </p>

      </div>
    `;
    return;
  }
  const quizzes = await Promise.all(
    purchases.map(async (purchaseId) => {
      try {
        const purchaseDoc = await getDoc(doc(db, "purchases", purchaseId));
        if (!purchaseDoc.exists()) return null;

        const purchase = purchaseDoc.data();

        const quizDoc = await getDoc(doc(db, "quizzes", purchase.quizId));
        if (!quizDoc.exists()) return null;

        const quiz = quizDoc.data();

        return {
          id: purchase.quizId,
          title: quiz.title,
          subjectName: quiz.subjectName,
          week: quiz.week,
          // Backward compatibility: quizzes created before semester
          // existed default to Semester 2 — same fallback used in
          // marketplace.js's loadActiveQuizzes().
          semester: quiz.semester ?? 2,
        };
      } catch (error) {
        console.error(error);
        return null;
      }
    }),
  );
  if (!document.getElementById("myQuizList")) return;

  purchasedQuizzes = quizzes.filter(Boolean);

  stopLoading(); // ✅ remove overlay once quizzes are loaded

  if (purchasedQuizzes.length === 0) {
    container.innerHTML = `
    <div class="empty-state">
      <h3>Could not load quizzes</h3>
      <p>Please try again later.</p>
    </div>
  `;
    return;
  }

  renderSemesterFilter();
  renderSubjectFilter();
  renderQuizSummary();
  renderQuizList();
  attachSearchListener();
}

/* =========================================================
   SEMESTER FILTER
========================================================= */
function renderSemesterFilter() {
  const container = document.getElementById("myQuizSemesterFilter");
  if (!container) return;

  const semesters = sortDropdownValues([
    ...new Set(purchasedQuizzes.map((quiz) => String(quiz.semester))),
  ]);

  container.innerHTML = `
    <select id="myQuizSemesterSelect">
      <option value="All" ${selectedSemester === "All" ? "selected" : ""}>
        All Semesters
      </option>
      ${semesters
        .map(
          (semester) => `
            <option value="${semester}" ${semester === selectedSemester ? "selected" : ""}>
              ${
                semester === "1"
                  ? "First Semester"
                  : semester === "2"
                    ? "Second Semester"
                    : `Semester ${semester}`
              }
            </option>
          `,
        )
        .join("")}
    </select>
  `;

  document
    .getElementById("myQuizSemesterSelect")
    .addEventListener("change", (e) => {
      selectedSemester = e.target.value;
      // Available subjects can differ per semester, so the subject
      // chips are rebuilt (and reset to "All") whenever the
      // semester changes — same relationship marketplace.js keeps
      // between its level/semester dropdowns and its subject chips.
      selectedSubject = "All";
      renderSubjectFilter();
      rerenderList();
    });
}

/* =========================================================
   SUBJECT FILTER (chips)
   Same visual/behavioral pattern as marketplace.js's
   renderMarketplaceFilters() — a row of pill buttons, one per
   subject, scoped to whatever's currently selected in the
   semester dropdown above.
========================================================= */
function renderSubjectFilter() {
  const container = document.getElementById("myQuizSubjectFilter");
  if (!container) return;

  const semesterScopedQuizzes = purchasedQuizzes.filter(
    (quiz) =>
      selectedSemester === "All" || String(quiz.semester) === selectedSemester,
  );

  const subjects = [
    "All",
    ...new Set(semesterScopedQuizzes.map((quiz) => quiz.subjectName)),
  ].sort((a, b) => {
    if (a === "All") return -1;
    if (b === "All") return 1;
    return a.localeCompare(b);
  });

  container.innerHTML = subjects
    .map(
      (subject) => `
        <button
          class="filter-chip ${selectedSubject === subject ? "active" : ""}"
          data-subject="${subject}">
          ${subject}
        </button>
      `,
    )
    .join("");

  container.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedSubject = chip.dataset.subject;
      renderSubjectFilter();
      rerenderList();
    });
  });
}

function rerenderList() {
  const term = document
    .getElementById("myQuizSearch")
    .value.trim()
    .toLowerCase();
  renderQuizList(term);
  renderQuizSummary(term);
}

// Numeric values sort ascending; non-numeric values sort
// alphabetically after all numeric ones. Same convention as
// marketplace.js's sortDropdownValues.
function sortDropdownValues(values) {
  return values.sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    const aIsNum = !Number.isNaN(numA);
    const bIsNum = !Number.isNaN(numB);

    if (aIsNum && bIsNum) return numA - numB;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b);
  });
}

function matchesFilters(quiz, searchTerm) {
  const week = `week ${quiz.week}`;

  const matchesSearch =
    quiz.title.toLowerCase().includes(searchTerm) ||
    quiz.subjectName.toLowerCase().includes(searchTerm) ||
    week.includes(searchTerm);

  const matchesSemester =
    selectedSemester === "All" || String(quiz.semester) === selectedSemester;

  const matchesSubject =
    selectedSubject === "All" || quiz.subjectName === selectedSubject;

  return matchesSearch && matchesSemester && matchesSubject;
}

function renderQuizList(searchTerm = "") {
  const container = document.getElementById("myQuizList");
  if (!container) return;

  const filtered = purchasedQuizzes.filter((quiz) =>
    matchesFilters(quiz, searchTerm),
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No quizzes found</h3>
        <p>Try another search, subject or semester.</p>
      </div>
    `;
    return;
  }

  const grouped = filtered.reduce((groups, quiz) => {
    if (!groups[quiz.subjectName]) {
      groups[quiz.subjectName] = [];
    }

    groups[quiz.subjectName].push(quiz);
    return groups;
  }, {});

  container.innerHTML = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, quizzes]) => {
      quizzes.sort((a, b) => a.week - b.week);

      return `
      <section class="my-quiz-section">

        <div class="my-quiz-section-header">
          <h3 class="my-quiz-section-title">${subject}</h3>

          <span class="my-quiz-section-count">
            ${quizzes.length} Quiz${quizzes.length > 1 ? "zes" : ""}
          </span>
        </div>

        <div class="my-quiz-grid">

          ${quizzes
            .map(
              (quiz) => `
                <div class="quiz-card">

                  <span class="quiz-subject">
                    ${quiz.subjectName}
                  </span>

                  <h3>${quiz.title}</h3>

                  <p class="quiz-week">
                    Week ${quiz.week}
                  </p>

                  <button
                    class="attempt-btn"
                    data-id="${quiz.id}"
                    data-title="${quiz.title}"
                  >
                    🚀 Start Quiz
                  </button>

                </div>
              `,
            )
            .join("")}

        </div>

      </section>
    `;
    })
    .join("");
  container.querySelectorAll(".attempt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      startPurchasedQuiz(currentUserData, btn.dataset.id, btn.dataset.title);
    });
  });
}
function renderQuizSummary(searchTerm = "") {
  const summary = document.getElementById("myQuizSummary");
  if (!summary) return;

  const visibleQuizzes = purchasedQuizzes.filter((quiz) =>
    matchesFilters(quiz, searchTerm),
  );

  const subjectCount = new Set(visibleQuizzes.map((quiz) => quiz.subjectName))
    .size;

  summary.innerHTML = `
    <div class="my-quiz-stat">
      <span class="my-quiz-stat-value">${visibleQuizzes.length}</span>
      <span class="my-quiz-stat-label">Purchased</span>
    </div>

    <div class="my-quiz-stat">
      <span class="my-quiz-stat-value">${subjectCount}</span>
      <span class="my-quiz-stat-label">Subjects</span>
    </div>

    <div class="my-quiz-stat">
      <span class="my-quiz-stat-value">${visibleQuizzes.length}</span>
      <span class="my-quiz-stat-label">Ready</span>
    </div>
  `;
}

function attachSearchListener() {
  const search = document.getElementById("myQuizSearch");

  search.addEventListener("input", () => {
    const term = search.value.trim().toLowerCase();
    renderQuizList(term);
    renderQuizSummary(term);
  });
}
