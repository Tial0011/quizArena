import { db } from "../firebase/config.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { startPurchasedQuiz } from "./purchasedQuiz.js";

export async function renderMyQuizzes(userData = {}) {
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

      <div id="myQuizList">

        <div class="empty-state">
          Loading quizzes...
        </div>

      </div>

    </div>
  `;

  const container = document.getElementById("myQuizList");

  const purchases = userData?.purchasedQuizzes || [];

  if (purchases.length === 0) {
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
      // Load purchase document
      const purchaseDoc = await getDoc(doc(db, "purchases", purchaseId));

      if (!purchaseDoc.exists()) continue;

      const purchase = purchaseDoc.data();

      // Load actual quiz
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
      startPurchasedQuiz(btn.dataset.id, btn.dataset.title);
    });
  });
}
