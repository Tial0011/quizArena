/* =========================================================
   ANALYTICS WIDGETS (shared)

   Pure markup builders — take an array of attempt records
   (from attemptsService.getRecentAttempts) and return HTML
   strings. No Firestore calls here, no DOM writes; the caller
   (studentDashboard.js) owns injecting these into the page.
========================================================= */

/* =========================
   RECENT ATTEMPTS LIST
========================= */
export function renderRecentAttemptsMarkup(attempts) {
  if (!attempts || attempts.length === 0) {
    return `
      <div class="empty-state">
        No quiz attempts yet.
        <br><br>
        Start practicing to see your progress here.
      </div>
    `;
  }

  return `
    <div class="attempts-list">
      ${attempts.map(renderAttemptItem).join("")}
    </div>
  `;
}

function renderAttemptItem(attempt) {
  const isPurchased = attempt.mode === "purchased";
  const title = isPurchased
    ? attempt.quizTitle || attempt.subjectName || "Quiz"
    : `${attempt.subjectName || "Practice"} Practice`;

  const modeLabel = isPurchased ? "Purchased Quiz" : "Practice";
  const dateLabel = formatAttemptDate(attempt.completedAt);

  return `
    <div class="attempt-item">
      <div class="attempt-item-main">
        <span class="attempt-title">${title}</span>
        <span class="badge attempt-mode-badge">${modeLabel}</span>
      </div>
      <div class="attempt-item-meta">
        <span class="attempt-score">${attempt.score}/${attempt.totalQuestions} (${attempt.percentage}%)</span>
        <span class="attempt-date">${dateLabel}</span>
      </div>
    </div>
  `;
}

function formatAttemptDate(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") return "";

  const date = timestamp.toDate();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* =========================
   SCORE TREND CHART (inline SVG)
   No charting library — this stack stays vanilla JS, so the
   chart is a small hand-built SVG line + dots.
========================= */
export function renderScoreTrendChartMarkup(attempts) {
  if (!attempts || attempts.length === 0) {
    return `
      <div class="empty-state">
        No quiz attempts yet.
        <br><br>
        Complete a quiz to start your score trend.
      </div>
    `;
  }

  if (attempts.length === 1) {
    return `
      <div class="empty-state">
        Complete one more quiz to see your score trend.
      </div>
    `;
  }

  // attempts arrive newest-first; chart reads left (oldest) to
  // right (most recent).
  const chronological = [...attempts].reverse();

  const width = 600;
  const height = 180;
  const padding = 24;

  const points = chronological.map((attempt, index) => {
    const x =
      chronological.length === 1
        ? width / 2
        : padding +
          (index / (chronological.length - 1)) * (width - padding * 2);
    const y =
      height - padding - (attempt.percentage / 100) * (height - padding * 2);
    return { x, y, percentage: attempt.percentage };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const dots = points
    .map(
      (p) =>
        `<circle class="trend-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4">
          <title>${p.percentage}%</title>
        </circle>`,
    )
    .join("");

  return `
    <svg
      class="score-trend-chart"
      viewBox="0 0 ${width} ${height}"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <line
        class="trend-baseline"
        x1="${padding}"
        y1="${height - padding}"
        x2="${width - padding}"
        y2="${height - padding}"
      ></line>
      <path class="trend-line" d="${pathD}" fill="none"></path>
      ${dots}
    </svg>
  `;
}
