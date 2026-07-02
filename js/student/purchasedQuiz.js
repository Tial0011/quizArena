import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";
import { renderReviewAnswers } from "./reviewAnswers.js";

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

export async function startPurchasedQuiz(userData, quizId, quizTitle = "Quiz") {
  history.pushState(
    {
      page: "purchasedQuiz",
    },
    "",
    "",
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
    alert("No questions found.");
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

  app.innerHTML = `
    <div class="quiz-container">

      <div class="quiz-header">

        <h2>
          ${quizTitle}
        </h2>

        <div
          id="quizTimer"
          class="quiz-timer"
        >
          ${formatTime(timeRemaining)}
        </div>

      </div>

      <div class="quiz-progress">
        Question
        ${currentQuestion + 1}
        of
        ${questions.length}
      </div>

      <div class="quiz-card">

        <h3 class="quiz-question">
          ${question.question}
        </h3>

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
                  ${["A", "B", "C", "D"][index]}.
                  ${option}
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
  `;

  attachEvents(quizTitle);
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

function startTimer(quizTitle) {
  clearInterval(timer);

  timer = setInterval(() => {
    timeRemaining--;

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
    renderReviewAnswers(questions, answers, () => location.reload());
  });

  document.getElementById("restartBtn").addEventListener("click", () => {
    location.reload();
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);

  const secs = seconds % 60;

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
