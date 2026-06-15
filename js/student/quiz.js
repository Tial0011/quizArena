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

let timer = null;
let timeRemaining = 0;

export async function startQuiz(subject, count, minutes) {
  const q = query(
    collection(db, "questions"),
    where("subjectName", "==", subject),
  );

  const snapshot = await getDocs(q);

  const allQuestions = [];

  snapshot.forEach((docSnap) => {
    allQuestions.push({
      id: docSnap.id,
      ...docSnap.data(),
    });
  });

  if (allQuestions.length === 0) {
    alert("No questions found for this subject.");
    return;
  }

  questions = shuffle(allQuestions);

  if (count > questions.length) {
    count = questions.length;
  }

  questions = questions.slice(0, count);

  answers = new Array(questions.length).fill(null);

  currentQuestion = 0;

  timeRemaining = minutes * 60;

  renderQuestion();

  startTimer();
}

function renderQuestion() {
  const app = document.getElementById("app");

  const question = questions[currentQuestion];

  app.innerHTML = `
    <div class="quiz-container">

      <div class="quiz-header">

        <div class="quiz-progress">
          Question ${currentQuestion + 1}
          of
          ${questions.length}
        </div>

        <div id="quizTimer" class="quiz-timer">
          ${formatTime(timeRemaining)}
        </div>

      </div>

      <div class="quiz-card">

        <h2 class="quiz-question">
          ${question.question}
        </h2>

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

  attachEvents();
}

function attachEvents() {
  document.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);

      answers[currentQuestion] = index;

      renderQuestion();
    });
  });

  document.getElementById("prevBtn")?.addEventListener("click", () => {
    if (currentQuestion > 0) {
      currentQuestion--;
      renderQuestion();
    }
  });

  document.getElementById("nextBtn")?.addEventListener("click", () => {
    if (currentQuestion < questions.length - 1) {
      currentQuestion++;
      renderQuestion();
    }
  });

  document.getElementById("finishBtn")?.addEventListener("click", finishQuiz);
}

function startTimer() {
  clearInterval(timer);

  timer = setInterval(() => {
    timeRemaining--;

    const timerEl = document.getElementById("quizTimer");

    if (timerEl) {
      timerEl.textContent = formatTime(timeRemaining);
    }

    if (timeRemaining <= 0) {
      clearInterval(timer);

      alert("Time Up!");

      finishQuiz();
    }
  }, 1000);
}

function finishQuiz() {
  clearInterval(timer);

  let score = 0;

  questions.forEach((question, index) => {
    if (answers[index] === question.answer) {
      score++;
    }
  });

  const percentage = Math.round((score / questions.length) * 100);

  let message = "Keep Practicing 💪";

  if (percentage >= 80) {
    message = "Excellent Work 🎉";
  } else if (percentage >= 60) {
    message = "Good Job 👍";
  }

  document.getElementById("app").innerHTML = `
    <div class="quiz-result">

      <h1>
        Quiz Completed
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
        ${message}
      </p>

      <button id="restartBtn">
        Back To Dashboard
      </button>

    </div>
  `;

  document.getElementById("restartBtn").addEventListener("click", () => {
    location.reload();
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);

  const secs = seconds % 60;

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}
