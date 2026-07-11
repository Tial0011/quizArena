import { db } from "../firebase/config.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { startPurchasedQuiz } from "./purchasedQuiz.js";
import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";
import { showLoadingOverlay } from "./loadingOverlay.js"; // ✅ added

export async function renderMyQuizzes(userData = {}) {
  history.pushState(
    {
      page: "myQuizzes",
    },
    "",
    "",
  );
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="dashboard">

      <header class="dashboard-header">

        <h1>
          📚 My Quizzes
        </h1>

        <p>
          Access and attempt your purchased weekly quizzes.
        </p>

      </header>

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

  let html = "";

  for (const purchaseId of purchases) {
    try {
      const purchaseDoc = await getDoc(doc(db, "purchases", purchaseId));
      if (!purchaseDoc.exists()) continue;

      const purchase = purchaseDoc.data();

      const quizDoc = await getDoc(doc(db, "quizzes", purchase.quizId));
      if (!quizDoc.exists()) continue;

      const quiz = quizDoc.data();

      html += `
        <div class="quiz-card">

          <span class="quiz-subject">
            ${quiz.subjectName}
          </span>

          <h3>
            ${quiz.title}
          </h3>

          <p class="quiz-week">
            Week ${quiz.week}
          </p>

          <button
            class="attempt-btn"
            data-id="${purchase.quizId}"
            data-title="${quiz.title}"
          >
            🚀 Start Quiz
          </button>

        </div>
      `;
    } catch (error) {
      console.error(error);
    }
  }

  stopLoading(); // ✅ remove overlay once quizzes are loaded

  if (html === "") {
    container.innerHTML = `
      <div class="empty-state">

        <h3>Could not load quizzes</h3>

        <p>
          Please try again later.
        </p>

      </div>
    `;
    return;
  }

  container.innerHTML = html;

  document.querySelectorAll(".attempt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      startPurchasedQuiz(userData, btn.dataset.id, btn.dataset.title);
    });
  });

  registerBackHandler(() => {
    renderStudentDashboard(userData);
  });
}
