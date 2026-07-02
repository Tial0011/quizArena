import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { startQuiz } from "./quiz.js";
import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";

/* =========================================================
   DEFAULTS
========================================================= */
const DEFAULT_QUESTION_COUNT = 20;
const DEFAULT_TIME_MINUTES = 20;

let currentUserData = {};

export async function renderPracticeArena(userData = {}) {
  history.pushState(
    {
      page: "practice",
    },
    "",
    "",
  );
  currentUserData = userData;

  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="dashboard">

      <header class="dashboard-header">

        <h1>🎯 Practice Arena</h1>

        <p>
          Practice questions from your purchased quizzes.
        </p>

      </header>

      <div class="practice-card">

        <div class="form-group">

          <label for="subjectSelect">Subject</label>

          <select id="subjectSelect">
            <option value="">
              Select Subject
            </option>
          </select>

        </div>

        <div class="form-group">

          <label for="questionCount">Number of Questions</label>

          <input
            id="questionCount"
            type="number"
            min="1"
            value="${DEFAULT_QUESTION_COUNT}"
          >

        </div>

        <div class="form-group">

          <label for="timeLimit">Time (Minutes)</label>

          <input
            id="timeLimit"
            type="number"
            min="1"
            value="${DEFAULT_TIME_MINUTES}"
          >

        </div>

        <button id="startPracticeBtn">

          🚀 Start Practice

        </button>

      </div>

    </div>
  `;

  await loadPurchasedSubjects();

  document
    .getElementById("startPracticeBtn")
    .addEventListener("click", beginPractice);
  registerBackHandler(() => {
    renderStudentDashboard(userData);
  });
}

async function loadPurchasedSubjects() {
  const select = document.getElementById("subjectSelect");

  const purchases = currentUserData.purchasedQuizzes || [];

  const subjects = new Set();

  for (const purchaseId of purchases) {
    try {
      const purchaseDoc = await getDoc(doc(db, "purchases", purchaseId));

      if (!purchaseDoc.exists()) continue;

      const purchase = purchaseDoc.data();

      const quizDoc = await getDoc(doc(db, "quizzes", purchase.quizId));

      if (!quizDoc.exists()) continue;

      const quiz = quizDoc.data();

      subjects.add(quiz.subjectName);
    } catch (error) {
      console.error(error);
    }
  }

  subjects.forEach((subject) => {
    select.innerHTML += `
      <option value="${subject}">
        ${subject}
      </option>
    `;
  });
}

function beginPractice() {
  const subject = document.getElementById("subjectSelect").value;

  const count = Number(document.getElementById("questionCount").value);

  const time = Number(document.getElementById("timeLimit").value);

  if (!subject) {
    alert("Please select a subject.");
    return;
  }

  if (!(count > 0)) {
    alert("Please enter a valid number of questions.");
    return;
  }

  if (!(time > 0)) {
    alert("Please enter a valid time limit.");
    return;
  }

  // Note: if `count` exceeds the number of questions actually
  // available for this subject, startQuiz() in quiz.js already
  // clamps it down to whatever is available — no extra handling
  // needed here.
  startQuiz(subject, count, time, currentUserData);
}
