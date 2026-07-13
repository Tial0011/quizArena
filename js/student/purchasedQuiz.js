import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";
import { renderMyQuizzes } from "./myQuizzes.js";
import { renderReviewAnswers } from "./reviewAnswers.js";
import {
  renderQuestionNavigatorMarkup,
  attachNavigatorEvents,
} from "./questionNavigator.js";
import { recordQuizAttempt } from "./attemptsService.js";
import { showLoadingOverlay } from "./loadingOverlay.js";

/* =========================================================
   CBT CONFIG
   Fixed rules for purchased quiz attempts, kept separate from
   Practice Arena (which is untouched by this file).
========================================================= */
const CBT_QUESTION_LIMIT = 25;
const CBT_TIME_LIMIT_SECONDS = 10 * 60; // fixed 10-minute timer

let questions = [];
let answers = [];
let currentQuestion = 0;

let timer;
let timeRemaining;

let currentUserId = null;
let currentQuizId = null;
let currentUserData = null;

export async function startPurchasedQuiz(userData, quizId, quizTitle = "Quiz") {
  currentUserId = userData?.id || null;
  currentQuizId = quizId;
  currentUserData = userData;

  history.pushState(
    {
      page: "purchasedQuiz",
    },
    "",
    "",
  );

  const app = document.getElementById("app");

  const stopLoading = showLoadingOverlay(
    app,
    [
      "Loading your quiz...",
      "Picking 25 questions...",
      "Starting your timer...",
      "Almost ready...",
    ],
    { subtitle: "This usually takes just a moment" },
  );

  const q = query(collection(db, "questions"), where("quizId", "==", quizId));

  const snapshot = await getDocs(q);

  const allQuestions = [];

  snapshot.forEach((docSnap) => {
    allQuestions.push({
      id: docSnap.id,
      ...docSnap.data(),
    });
  });

  if (!allQuestions.length) {
    stopLoading();
    alert("No questions found.");
    // Self-contained recovery: this file doesn't know what the
    // caller's list screen looks like, so fall back to the
    // dashboard — the same destination the back-handler below
    // would take the student to anyway, rather than leaving the
    // loading overlay stuck on screen.
    renderStudentDashboard(userData);
    return;
  }

  // Shuffle the full question bank, then take up to CBT_QUESTION_LIMIT.
  // If the quiz has fewer questions than the limit, this naturally
  // just uses all of them (slice clamps to array length).
  questions = shuffleArray(allQuestions).slice(0, CBT_QUESTION_LIMIT);

  answers = new Array(questions.length).fill(null);

  currentQuestion = 0;

  timeRemaining = CBT_TIME_LIMIT_SECONDS;
  registerBackHandler(() => {
    renderMyQuizzes(userData);
  });

  stopLoading();
  renderQuestion(quizTitle);

  startTimer(quizTitle);
}

/**
 * Fisher-Yates shuffle. Returns a new array — does not mutate
 * the array passed in.
 */
function shuffleArray(array) {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function renderQuestion(quizTitle) {
  const app = document.getElementById("app");

  const question = questions[currentQuestion];
  const progressPercent = Math.round(
    ((currentQuestion + 1) / questions.length) * 100,
  );

  const navigatorHtml = renderQuestionNavigatorMarkup(
    questions,
    answers,
    currentQuestion,
  );

  app.innerHTML = `
    <div class="quiz-layout">

      <aside class="question-navigator-sidebar">
        ${navigatorHtml}
      </aside>

      <div class="quiz-container">

      <button id="openNavigatorBtn" class="nav-toggle-btn" type="button">
        📋 Questions
      </button>

      <div class="quiz-topbar">

        <div class="quiz-header">
          <h2 class="quiz-title">
            ${quizTitle}
          </h2>

          <div id="quizTimer" class="quiz-timer">
            ${formatTime(timeRemaining)}
          </div>
        </div>

        <div class="quiz-progress-row">
          <span class="quiz-progress">
            Question ${currentQuestion + 1} of ${questions.length}
          </span>
        </div>

        <div class="quiz-progress-track">
          <div class="quiz-progress-fill" style="width: ${progressPercent}%"></div>
        </div>

      </div>

      <div class="quiz-card">

        <h3 class="quiz-question">
          ${question.question}
        </h3>

        ${
          question.image
            ? `<img class="quiz-question-image" src="${question.image}" alt="Question image" />`
            : ""
        }

        <div class="quiz-options">

          ${question.options
            .map(
              (option, index) => `
                <button
                  class="
                    option-btn
                    ${answers[currentQuestion] === index ? "selected" : ""}
                  "
                  data-index="${index}"
                >
                  <span class="option-letter">${["A", "B", "C", "D"][index]}</span>
                  <span class="option-text">${option}</span>
                </button>
              `,
            )
            .join("")}

        </div>

      </div>

      <div class="quiz-actions">

        <button
          id="prevBtn"
          ${currentQuestion === 0 ? "disabled" : ""}
        >
          Previous
        </button>

        ${
          currentQuestion === questions.length - 1
            ? `
              <button id="finishBtn">
                Finish Quiz
              </button>
            `
            : `
              <button id="nextBtn">
                Next
              </button>
            `
        }

      </div>

      </div>

    </div>

    <div id="navigatorOverlay" class="navigator-overlay" hidden>
      <div class="navigator-drawer">
        <div class="navigator-drawer-header">
          <h3>Questions</h3>
          <button id="closeNavigatorBtn" class="navigator-close-btn" type="button">
            ✕
          </button>
        </div>
        ${navigatorHtml}
      </div>
    </div>
  `;

  attachEvents(quizTitle);
  attachNavigatorEvents(
    document.querySelector(".question-navigator-sidebar"),
    (index) => goToQuestion(index, quizTitle),
  );
  attachNavigatorEvents(
    document.getElementById("navigatorOverlay"),
    (index) => {
      goToQuestion(index, quizTitle);
      closeNavigatorDrawer();
    },
  );
  attachNavigatorToggleEvents();
}

function goToQuestion(index, quizTitle) {
  if (index < 0 || index >= questions.length) return;
  currentQuestion = index;
  renderQuestion(quizTitle);
}

function attachNavigatorToggleEvents() {
  document
    .getElementById("openNavigatorBtn")
    ?.addEventListener("click", openNavigatorDrawer);

  document
    .getElementById("closeNavigatorBtn")
    ?.addEventListener("click", closeNavigatorDrawer);

  document
    .getElementById("navigatorOverlay")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "navigatorOverlay") {
        closeNavigatorDrawer();
      }
    });
}

function openNavigatorDrawer() {
  const overlay = document.getElementById("navigatorOverlay");
  if (overlay) overlay.hidden = false;
}

function closeNavigatorDrawer() {
  const overlay = document.getElementById("navigatorOverlay");
  if (overlay) overlay.hidden = true;
}

function attachEvents(quizTitle) {
  document.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      answers[currentQuestion] = Number(btn.dataset.index);

      renderQuestion(quizTitle);
    });
  });

  document.getElementById("prevBtn")?.addEventListener("click", () => {
    if (currentQuestion > 0) {
      currentQuestion--;

      renderQuestion(quizTitle);
    }
  });

  document.getElementById("nextBtn")?.addEventListener("click", () => {
    if (currentQuestion < questions.length - 1) {
      currentQuestion++;

      renderQuestion(quizTitle);
    }
  });

  document
    .getElementById("finishBtn")
    ?.addEventListener("click", () => finishQuiz(quizTitle));
}

let timerEndAt = 0; // wall-clock timestamp (ms) the timer should hit 0 at

function startTimer(quizTitle) {
  clearInterval(timer);

  // Anchor to a fixed end time instead of just decrementing a
  // counter every tick — see quiz.js for the full explanation of
  // why the old approach drifts slower than real time on a long
  // (10 minute) countdown.
  timerEndAt = Date.now() + timeRemaining * 1000;

  timer = setInterval(() => {
    timeRemaining = Math.max(0, Math.round((timerEndAt - Date.now()) / 1000));

    const timerEl = document.getElementById("quizTimer");

    if (timerEl) {
      timerEl.textContent = formatTime(timeRemaining);
    }

    if (timeRemaining <= 0) {
      clearInterval(timer);

      finishQuiz(quizTitle);
    }
  }, 1000);
}

function finishQuiz(quizTitle) {
  clearInterval(timer);

  let score = 0;

  questions.forEach((question, index) => {
    if (answers[index] === question.answer) {
      score++;
    }
  });

  const percentage = Math.round((score / questions.length) * 100);

  // Fire-and-forget: analytics should never delay or block the
  // student from seeing their result. recordQuizAttempt() already
  // swallows its own errors.
  recordQuizAttempt({
    userId: currentUserId,
    mode: "purchased",
    subjectName: questions[0]?.subjectName || "",
    quizId: currentQuizId,
    quizTitle,
    score,
    totalQuestions: questions.length,
  });

  document.getElementById("app").innerHTML = `
    <div class="quiz-result">

      <h1>
        ${quizTitle}
      </h1>

      <div class="score-circle">
        ${percentage}%
      </div>

      <h2>
        ${score}
        /
        ${questions.length}
      </h2>

      <p>
        Quiz Completed 🎉
      </p>

      <div class="result-actions">

        <button id="reviewAnswersBtn" class="review-answers-btn">
          Review Answers
        </button>

        <button id="restartBtn" class="result-back-btn">
          Back To Dashboard
        </button>

      </div>

    </div>
  `;

  document.getElementById("reviewAnswersBtn").addEventListener("click", () => {
    renderReviewAnswers(questions, answers, () =>
      renderStudentDashboard(currentUserData),
    );
  });

  document.getElementById("restartBtn").addEventListener("click", () => {
    renderStudentDashboard(currentUserData);
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);

  const secs = seconds % 60;

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
