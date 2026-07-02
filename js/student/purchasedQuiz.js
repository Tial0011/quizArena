import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let questions = [];
let answers = [];
let currentQuestion = 0;

let timer;
let timeRemaining;

export async function startPurchasedQuiz(quizId, quizTitle = "Quiz") {
  const q = query(collection(db, "questions"), where("quizId", "==", quizId));

  const snapshot = await getDocs(q);

  questions = [];

  snapshot.forEach((docSnap) => {
    questions.push({
      id: docSnap.id,
      ...docSnap.data(),
    });
  });

  if (!questions.length) {
    alert("No questions found.");
    return;
  }

  answers = new Array(questions.length).fill(null);

  currentQuestion = 0;

  timeRemaining = 30 * 60;

  renderQuestion(quizTitle);

  startTimer(quizTitle);
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

      <button
        onclick="location.reload()"
      >
        Back To Dashboard
      </button>

    </div>
  `;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);

  const secs = seconds % 60;

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
