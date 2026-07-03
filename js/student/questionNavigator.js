/* =========================================================
   QUESTION NAVIGATOR (shared)

   Renders the clickable question-number grid used both in
   the desktop sidebar and the mobile drawer. Doesn't touch
   quiz state itself — callers pass in questions/answers/
   currentIndex and get markup back, plus a small helper to
   wire up clicks against a given container.
========================================================= */

/**
 * @param {Array} questions
 * @param {Array} answers - answers[i] is the selected option index, or null
 * @param {number} currentIndex
 * @returns {string} HTML for the navigator grid + legend
 */
export function renderQuestionNavigatorMarkup(
  questions,
  answers,
  currentIndex,
) {
  const buttons = questions
    .map((_, index) => {
      const statusClass = getStatusClass(answers, currentIndex, index);

      return `
        <button
          type="button"
          class="nav-question-btn ${statusClass}"
          data-index="${index}"
        >
          ${index + 1}
        </button>
      `;
    })
    .join("");

  return `
    <h4 class="navigator-title">Questions</h4>

    <div class="navigator-grid">
      ${buttons}
    </div>

    <div class="navigator-legend">
      <span class="legend-item">
        <span class="legend-dot nav-current"></span>
        Current
      </span>
      <span class="legend-item">
        <span class="legend-dot nav-answered"></span>
        Answered
      </span>
      <span class="legend-item">
        <span class="legend-dot nav-unanswered"></span>
        Unanswered
      </span>
    </div>
  `;
}

function getStatusClass(answers, currentIndex, index) {
  if (index === currentIndex) return "nav-current";

  const hasAnswer = answers[index] !== null && answers[index] !== undefined;
  return hasAnswer ? "nav-answered" : "nav-unanswered";
}

/**
 * Wires up click handling for a navigator grid rendered inside
 * `container`. Call once per container (sidebar, drawer).
 *
 * @param {HTMLElement} container
 * @param {(index: number) => void} onSelect
 */
export function attachNavigatorEvents(container, onSelect) {
  if (!container) return;

  container.querySelectorAll(".nav-question-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      onSelect(Number(btn.dataset.index));
    });
  });
}
