import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { startQuiz } from "./quiz.js";

let currentUserData = {};

export async function renderPracticeArena(userData = {}) {
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

          <label>Subject</label>

          <select id="subjectSelect">
            <option value="">
              Select Subject
            </option>
          </select>

        </div>

        <div class="form-group">

          <label>Questions</label>

          <select id="questionCount">

            <option value="10">10 Questions</option>

            <option value="20">20 Questions</option>

            <option value="30">30 Questions</option>

          </select>

        </div>

        <div class="form-group">

          <label>Time Limit</label>

          <select id="timeLimit">

            <option value="10">10 Minutes</option>

            <option value="15">15 Minutes</option>

            <option value="20">20 Minutes</option>

          </select>

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

  startQuiz(subject, count, time, currentUserData);
}
