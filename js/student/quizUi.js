/* =========================================================
   QUIZ UI HELPERS (shared by quiz.js and purchasedQuiz.js)

   Both quiz screens render the same layout, so the desktop
   extras live here once instead of being copied into each file:
     - keyboard shortcuts (A–D / 1–4 to answer, ← → to move)
     - the "answered / submit" block under the question grid
     - the low-time timer state
     - the result screen markup
========================================================= */

/* ---------- keyboard ---------- */

let keyHandlers = null;
let keyListenerAttached = false;

function onKeyDown(e) {
  if (!keyHandlers) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // Only act while a quiz is actually on screen and the mobile
  // question drawer isn't covering it.
  if (!document.querySelector(".quiz-layout")) return;
  const overlay = document.getElementById("navigatorOverlay");
  if (overlay && !overlay.hidden) return;

  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  const key = e.key.toLowerCase();

  if (["a", "b", "c", "d"].includes(key)) {
    e.preventDefault();
    keyHandlers.select("abcd".indexOf(key));
  } else if (["1", "2", "3", "4"].includes(key)) {
    e.preventDefault();
    keyHandlers.select(Number(key) - 1);
  } else if (key === "arrowright" || key === "n") {
    e.preventDefault();
    keyHandlers.next();
  } else if (key === "arrowleft" || key === "p") {
    e.preventDefault();
    keyHandlers.prev();
  }
}

/**
 * Registers the handlers for the quiz that is starting now.
 * Calling it again (next quiz) simply replaces the old handlers,
 * so listeners never stack up.
 */
export function setQuizKeys(handlers) {
  keyHandlers = handlers;
  if (!keyListenerAttached) {
    document.addEventListener("keydown", onKeyDown);
    keyListenerAttached = true;
  }
}

export function clearQuizKeys() {
  keyHandlers = null;
}

/* ---------- markup ---------- */

export function quizHintMarkup() {
  return `<p class="quiz-hint">Shortcuts: <kbd>A</kbd>–<kbd>D</kbd> answer · <kbd>←</kbd> <kbd>→</kbd> move between questions</p>`;
}

/** Progress summary + submit button shown under the question grid. */
export function railExtrasMarkup(answeredCount, total) {
  const left = total - answeredCount;
  return `
    <div class="rail-summary">
      <p><strong>${answeredCount}</strong> of ${total} answered${
        left > 0 ? ` · ${left} left` : ""
      }</p>
      <button type="button" class="rail-finish">Submit quiz</button>
    </div>
  `;
}

export function wireRailFinish(answers, onFinish) {
  document.querySelectorAll(".rail-finish").forEach((btn) => {
    btn.addEventListener("click", () => {
      const unanswered = answers.filter((a) => a === null).length;
      if (
        unanswered > 0 &&
        !confirm(
          `${unanswered} question${unanswered === 1 ? " is" : "s are"} still unanswered. Submit anyway?`,
        )
      ) {
        return;
      }
      onFinish();
    });
  });
}

export function timerClass(seconds) {
  return seconds <= 60 ? "is-low" : "";
}

export function updateTimerEl(el, seconds, text) {
  el.textContent = text;
  el.classList.toggle("is-low", seconds <= 60);
}

/* ---------- result screen ---------- */

export function resultMarkup({
  title,
  percentage,
  score,
  total,
  answeredCount,
  message,
}) {
  const wrong = answeredCount - score;
  const skipped = total - answeredCount;
  const tier = percentage >= 80 ? "high" : percentage >= 60 ? "mid" : "low";

  return `
    <div class="quiz-result tier-${tier}">

      <section class="result-hero">
        <span class="result-kicker">Result</span>
        <h1>${title}</h1>
        <div class="score-circle">${percentage}<small>%</small></div>
        <p class="result-message">${message}</p>
        <div class="result-streak" id="resultStreak" role="status" hidden>
          <span class="result-streak-flame" aria-hidden="true">🔥</span>
          <span class="result-streak-copy"><strong id="resultStreakCount">0</strong><span id="resultStreakLabel">day streak</span></span>
        </div>
      </section>

      <section class="result-detail">
        <div class="result-stats">
          <div><strong>${score}</strong><span>Correct</span></div>
          <div><strong>${wrong}</strong><span>Wrong</span></div>
          <div><strong>${skipped}</strong><span>Skipped</span></div>
          <div><strong>${total}</strong><span>Total</span></div>
        </div>

        <div class="result-actions">
          <button id="reviewAnswersBtn" class="review-answers-btn">
            Review answers
          </button>
          <button id="restartBtn" class="result-back-btn">
            Back to dashboard
          </button>
        </div>
      </section>

    </div>
  `;
}

export function revealResultStreak(streakInfo) {
  if (!streakInfo) return;

  const streakEl = document.getElementById("resultStreak");
  const countEl = document.getElementById("resultStreakCount");
  const labelEl = document.getElementById("resultStreakLabel");
  if (!streakEl || !countEl || !labelEl) return;

  countEl.textContent = String(streakInfo.streak);
  labelEl.textContent = streakInfo.extended
    ? "day streak · extended!"
    : "day streak · today complete";
  streakEl.hidden = false;
  streakEl.classList.add("is-visible");
}
