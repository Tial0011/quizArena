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
import { showLoadingOverlay } from "./loadingOverlay.js";

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
  await renderPracticeArenaPage(userData);
}

async function renderPracticeArenaPage(userData) {
  currentUserData = userData;

  const app = document.getElementById("app");

  // Same shell + eyebrow pattern as marketplace.js / my-quizzes.js:
  // .practice-page owns its own background/padding/radius instead of
  // relying on .dashboard, and the header uses a plain heading (no
  // emoji) with an eyebrow tag instead of the old "🎯 Practice Arena"
  // style.
  app.innerHTML = `
    <div class="practice-page">

      <header class="practice-header">
        <span class="practice-eyebrow">Solo Practice</span>
        <h1>Practice Arena</h1>
        <p class="practice-subtitle">
          Practice questions from your purchased quizzes.
        </p>
      </header>

      <div class="practice-card">

       <div class="form-group">
  <label for="subjectSelect">Subject</label>
  <select id="subjectSelect">
    <option value="">Select Subject</option>
  </select>
</div>

<div class="practice-row">
  <div class="form-group">
    <label for="questionCount">Questions</label>
    <div class="practice-field-unit">
      <input id="questionCount" type="number" min="1" value="${DEFAULT_QUESTION_COUNT}">
      <span>questions</span>
    </div>
  </div>

  <div class="form-group">
    <label for="timeLimit">Time</label>
    <div class="practice-field-unit">
      <input id="timeLimit" type="number" min="1" value="${DEFAULT_TIME_MINUTES}">
      <span>min</span>
    </div>
  </div>
</div>

<p class="practice-pace" id="pacePreview"></p>

<button id="startPracticeBtn">🚀 Start Practice</button>

      </div>

    </div>
  `;
  function updatePacePreview() {
    const count = Number(document.getElementById("questionCount").value);
    const time = Number(document.getElementById("timeLimit").value);
    const pace = document.getElementById("pacePreview");
    if (count > 0 && time > 0) {
      pace.textContent = `≈ ${(time / count).toFixed(1)} min per question`;
    } else {
      pace.textContent = "";
    }
  }

  document
    .getElementById("questionCount")
    .addEventListener("input", updatePacePreview);
  document
    .getElementById("timeLimit")
    .addEventListener("input", updatePacePreview);
  updatePacePreview();
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

  select.disabled = true;
  select.innerHTML = `<option value="">Loading subjects...</option>`;

  const purchases = currentUserData.purchasedQuizzes || [];

  // Fetch every purchase doc at once instead of one at a time —
  // same fix already applied to startQuiz() in quiz.js. This runs
  // on page load, before the student can do anything else, so it
  // was directly contributing to Practice Arena feeling slow to
  // even open.
  //
  // Promise.allSettled (not Promise.all) so a single failed read
  // doesn't wipe out the whole list — matches the original code's
  // per-purchase try/catch resilience.
  const purchaseResults = await Promise.allSettled(
    purchases.map((purchaseId) => getDoc(doc(db, "purchases", purchaseId))),
  );

  const quizIds = [
    ...new Set(
      purchaseResults
        .filter((r) => r.status === "fulfilled" && r.value.exists())
        .map((r) => r.value.data().quizId),
    ),
  ];

  const quizResults = await Promise.allSettled(
    quizIds.map((quizId) => getDoc(doc(db, "quizzes", quizId))),
  );

  const subjects = new Set(
    quizResults
      .filter((r) => r.status === "fulfilled" && r.value.exists())
      .map((r) => r.value.data().subjectName),
  );

  select.disabled = false;
  select.innerHTML = `<option value="">Select Subject</option>`;

  subjects.forEach((subject) => {
    select.innerHTML += `
      <option value="${subject}">
        ${subject}
      </option>
    `;
  });
}

async function beginPractice() {
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

  const app = document.getElementById("app");

  const stopLoading = showLoadingOverlay(
    app,
    [
      "Gathering your questions...",
      "Shuffling things up...",
      "Setting your timer...",
      "Almost ready...",
    ],
    { subtitle: "This usually takes just a moment" },
  );

  // Note: if `count` exceeds the number of questions actually
  // available for this subject, startQuiz() in quiz.js already
  // clamps it down to whatever is available — no extra handling
  // needed here.
  const didStart = await startQuiz(subject, count, time, currentUserData);

  // Harmless if startQuiz() already replaced #app's contents with
  // the first question — this just stops the message rotation.
  stopLoading();

  // startQuiz() can bail out early (e.g. no questions exist for
  // this subject) without rendering anything — in that case #app
  // is still showing the loading overlay with nothing to recover
  // it. Rebuild the practice form directly (not via
  // renderPracticeArena) so this doesn't push a second, phantom
  // history entry — the student hasn't navigated anywhere.
  if (!didStart) {
    renderPracticeArenaPage(currentUserData);
  }
}
