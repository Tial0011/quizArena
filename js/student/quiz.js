import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { renderReviewAnswers } from "./reviewAnswers.js";
import {
  renderQuestionNavigatorMarkup,
  attachNavigatorEvents,
} from "./questionNavigator.js";

let questions = [];
let answers = [];
let currentQuestion = 0;

let timer = null;
let timeRemaining = 0;

export async function startQuiz(subject, count, minutes, userData) {
  const allQuestions = [];

  const purchases = userData?.purchasedQuizzes || [];

  for (const purchaseId of purchases) {
    const purchaseDoc = await getDoc(doc(db, "purchases", purchaseId));

    if (!purchaseDoc.exists()) continue;

    const purchase = purchaseDoc.data();

    const q = query(
      collection(db, "questions"),
      where("quizId", "==", purchase.quizId),
    );

    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      const question = {
        id: docSnap.id,
        ...docSnap.data(),
      };

      if (question.subjectName === subject) {
        allQuestions.push(question);
      }
    });
  }

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

        <h2 class="quiz-question">
          ${question.question}
        </h2>

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

  attachEvents();
  attachNavigatorEvents(
    document.querySelector(".question-navigator-sidebar"),
    goToQuestion,
  );
  attachNavigatorEvents(
    document.getElementById("navigatorOverlay"),
    (index) => {
      goToQuestion(index);
      closeNavigatorDrawer();
    },
  );
  attachNavigatorToggleEvents();
}

function goToQuestion(index) {
  if (index < 0 || index >= questions.length) return;
  currentQuestion = index;
  renderQuestion();
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

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}
