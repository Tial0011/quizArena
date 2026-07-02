/* =========================================================
   REVIEW ANSWERS (shared)

   Renders a read-only review of a completed quiz attempt.
   Used by both Practice (quiz.js) and Purchased Quiz
   (purchasedQuiz.js) — neither file duplicates this logic,
   they just call it with their own in-memory `questions`
   and `answers` arrays.

   Nothing here touches Firestore — everything needed is
   already in memory from the quiz that was just completed.
========================================================= */

const OPTION_LETTERS = ["A", "B", "C", "D"];

/**
 * @param {Array} questions - the questions the student was given
 * @param {Array} answers - the student's selected option index per question (or null)
 * @param {Function} onBack - called when "Back to Dashboard" is clicked
 */
export function renderReviewAnswers(questions, answers, onBack) {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="review-container">

      <h1 class="review-title">
        Review Answers
      </h1>

      <div class="review-list">
        ${questions
          .map((question, index) =>
            renderReviewCard(question, answers[index], index),
          )
          .join("")}
      </div>

      <button id="reviewBackBtn" class="review-back-btn">
        Back to Dashboard
      </button>

    </div>
  `;

  document.getElementById("reviewBackBtn").addEventListener("click", onBack);
}

function renderReviewCard(question, studentAnswer, index) {
  const correctIndex = question.answer;

  const optionsHtml = question.options
    .map((option, optIndex) =>
      renderReviewOption(option, optIndex, correctIndex, studentAnswer),
    )
    .join("");

  return `
    <div class="review-card">

      <div class="review-question-number">
        Question ${index + 1}
      </div>

      <h3 class="review-question-text">
        ${question.question}
      </h3>

      <div class="review-options">
        ${optionsHtml}
      </div>

    </div>
  `;
}

function renderReviewOption(option, optIndex, correctIndex, studentAnswer) {
  const isCorrect = optIndex === correctIndex;
  const isSelected = optIndex === studentAnswer;

  let optionClass = "normal-option";
  let label = "";

  if (isCorrect && isSelected) {
    // Student picked the correct answer — one green highlight only.
    optionClass = "correct-option";
    label = "Your Answer ✓";
  } else if (isCorrect) {
    // Correct answer, but the student didn't pick it.
    optionClass = "correct-option";
    label = "Correct Answer";
  } else if (isSelected) {
    // Student picked this, and it's wrong.
    optionClass = "wrong-option";
    label = "Your Answer";
  }

  return `
    <div class="review-option ${optionClass}">
      <span class="option-letter">${OPTION_LETTERS[optIndex]}.</span>
      <span class="option-text">${option}</span>
      ${label ? `<span class="option-label">${label}</span>` : ""}
    </div>
  `;
}
