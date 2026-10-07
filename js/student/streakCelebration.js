/* =========================================================
   STREAK UI (flame, celebration, streak sheet)

   - flameSvg(size): the animated flame used everywhere (top bar
     button, sheet, celebration). Drawn as layered SVG paths and
     animated with CSS (see css/student/streak.css) -- so it's
     crisp on every screen, tiny, and works offline. No video file.
   - showStreakCelebration(streak): the full-screen "you extended
     your streak" moment (Duolingo style). Called from the quiz
     result flow when a quiz is the FIRST of the day.
   - showStreakSheet({ streak, doneToday }): small card opened
     from the flame button in the dashboard top bar.
========================================================= */

let flameCounter = 0;

export function flameSvg(size = 24) {
  const id = `fl${++flameCounter}`; // unique gradient ids per instance

  return `
<svg class="fl" width="${size}" height="${Math.round(size * 1.25)}" viewBox="0 0 100 125" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${id}o" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff5a00"/>
      <stop offset="0.55" stop-color="#ff8a00"/>
      <stop offset="1" stop-color="#ffb000"/>
    </linearGradient>
    <linearGradient id="${id}m" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff9500"/>
      <stop offset="1" stop-color="#ffd23a"/>
    </linearGradient>
    <linearGradient id="${id}i" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ffd84d"/>
      <stop offset="1" stop-color="#fff6c8"/>
    </linearGradient>
  </defs>
  <path class="fl-outer" fill="url(#${id}o)" d="M50 3C53 22 80 36 84 68C88 100 70 122 50 122C30 122 12 100 16 70C18 52 28 44 35 28C39 40 46 42 50 3Z"/>
  <path class="fl-mid" fill="url(#${id}m)" d="M50 34C54 50 72 60 72 82C72 102 62 118 50 118C38 118 28 102 28 82C28 66 40 58 44 46C46 52 48 52 50 34Z"/>
  <path class="fl-inner" fill="url(#${id}i)" d="M50 68C53 80 63 87 62 100C61 112 56 117 50 117C44 117 39 112 38 100C37 87 47 80 50 68Z"/>
</svg>`;
}

const reduceMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** Last 7 calendar days (oldest -> today), marked active from the streak count. */
function weekMarkup(streak, doneToday, animate) {
  const endOffset = doneToday ? 0 : 1; // alive-but-not-today ends yesterday
  const cells = [];

  for (let ago = 6; ago >= 0; ago--) {
    const d = new Date();
    d.setDate(d.getDate() - ago);

    const active = streak > 0 && ago >= endOffset && ago < endOffset + streak;
    const isToday = ago === 0;
    const order = 6 - ago;

    cells.push(`
      <div class="sk-day ${active ? "is-on" : ""} ${isToday ? "is-today" : ""}" style="--i:${order}">
        <span class="sk-day-dot">${active ? "✓" : ""}</span>
        <span class="sk-day-l">${DAY_LETTERS[d.getDay()]}</span>
      </div>`);
  }

  return `<div class="sk-week ${animate ? "is-animated" : ""}">${cells.join("")}</div>`;
}

function headline(streak) {
  if (streak <= 1) return "You started a streak!";
  if (streak % 30 === 0) return `${streak} days. A whole month!`;
  if (streak % 7 === 0) return `${streak} day streak. A full week!`;
  return `${streak} day streak!`;
}

function subline(streak, nextTarget) {
  const tomorrow = nextTarget
    ? ` Tomorrow: ${nextTarget} quiz${nextTarget === 1 ? "" : "zes"}.`
    : "";
  if (streak <= 1) return `Come back tomorrow to keep the fire going.${tomorrow}`;
  if (streak % 30 === 0) return `Incredible consistency. Keep it burning.${tomorrow}`;
  if (streak % 7 === 0) return `Seven days stronger. Don't stop now.${tomorrow}`;
  return `You hit today's goal. Keep it going!${tomorrow}`;
}

function streakStatusText(streak, doneToday, info = {}) {
  const { remaining = 1, nextTarget = 1 } = info;
  const q = (n) => `${n} quiz${n === 1 ? "" : "zes"}`;
  if (streak === 0) return "Take a quiz today to light your first flame.";
  if (doneToday)
    return `Today is done. Tomorrow you need ${q(nextTarget)} to keep it going.`;
  return `Finish ${q(remaining)} today to keep your streak alive.`;
}

/* ---------------------------------------------------------
   Shared overlay plumbing
--------------------------------------------------------- */
let openOverlay = null; // only one streak overlay at a time

function lockScroll(on) {
  document.documentElement.classList.toggle("sk-lock", on);
}

function closeOverlay(el, onClosed) {
  if (!el || el.dataset.closing) return;
  el.dataset.closing = "1";
  document.removeEventListener("keydown", el._onKey);
  lockScroll(false);
  if (openOverlay === el) openOverlay = null;

  const done = () => {
    el.remove();
    onClosed?.();
  };
  if (reduceMotion()) done();
  else {
    el.classList.add("is-leaving");
    setTimeout(done, 260);
  }
}

function mount(el) {
  if (openOverlay) {
    openOverlay.remove();
    document.removeEventListener("keydown", openOverlay._onKey);
  }
  openOverlay = el;
  document.body.appendChild(el);
  lockScroll(true);

  el._onKey = (e) => {
    if (e.key === "Escape") closeOverlay(el);
  };
  document.addEventListener("keydown", el._onKey);
}

/* ---------------------------------------------------------
   Full-screen celebration
--------------------------------------------------------- */
export function showStreakCelebration(
  streak,
  { delay = 700, nextTarget = null } = {},
) {
  if (!streak || streak < 1) return;

  setTimeout(() => {
    const embers = Array.from({ length: 22 }, () => {
      const left = 8 + Math.random() * 84; // % across the screen
      const size = 3 + Math.random() * 6;
      const dur = 2.6 + Math.random() * 2.6;
      const delay = Math.random() * 2.4;
      const drift = (Math.random() - 0.5) * 90;
      return `<i class="sc-ember" style="left:${left.toFixed(1)}%;--s:${size.toFixed(1)}px;--dur:${dur.toFixed(2)}s;--del:${delay.toFixed(2)}s;--dx:${drift.toFixed(0)}px"></i>`;
    }).join("");

    const el = document.createElement("div");
    el.className = "sc";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Streak extended");
    el.innerHTML = `
      <div class="sc-glow"></div>
      <div class="sc-embers" aria-hidden="true">${embers}</div>

      <div class="sc-body">
        <div class="sc-flame-wrap">
          <div class="sc-flame">${flameSvg(150)}</div>
          <div class="sc-spark sc-spark-1"></div>
          <div class="sc-spark sc-spark-2"></div>
          <div class="sc-spark sc-spark-3"></div>
        </div>

        <div class="sc-count" id="scCount" aria-hidden="true">${Math.max(0, streak - 1)}</div>
        <h2 class="sc-title">${headline(streak)}</h2>
        <p class="sc-sub">${subline(streak, nextTarget)}</p>

        ${weekMarkup(streak, true, true)}

        <button type="button" class="sc-btn" id="scContinue">Continue</button>
      </div>
    `;

    mount(el);

    const countEl = el.querySelector("#scCount");
    if (reduceMotion()) {
      countEl.textContent = String(streak);
    } else {
      // The number "ticks up" by one right as the flame lights.
      setTimeout(() => {
        if (!countEl.isConnected) return;
        countEl.textContent = String(streak);
        countEl.classList.add("is-bumped");
      }, 900);
    }

    try {
      navigator.vibrate?.([40, 60, 40, 60, 120]);
    } catch {
      /* not supported */
    }

    const btn = el.querySelector("#scContinue");
    btn.addEventListener("click", () => closeOverlay(el));
    setTimeout(() => btn.focus({ preventScroll: true }), 1200);
  }, delay);
}

/* ---------------------------------------------------------
   Top-bar sheet
--------------------------------------------------------- */
export function showStreakSheet(info = {}) {
  const { streak = 0, doneToday = false } = info;
  const state = streak === 0 ? "none" : doneToday ? "done" : "risk";

  const el = document.createElement("div");
  el.className = "sk-sheet";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Your streak");
  el.innerHTML = `
    <div class="sk-card" data-state="${state}">
      <button type="button" class="sk-close" aria-label="Close">✕</button>
      <div class="sk-flame">${flameSvg(84)}</div>
      <div class="sk-num">${streak}</div>
      <div class="sk-label">day streak</div>
      <p class="sk-status">${streakStatusText(streak, doneToday, info)}</p>
      ${weekMarkup(streak, doneToday, false)}
    </div>
  `;

  mount(el);

  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest(".sk-close")) closeOverlay(el);
  });
  el.querySelector(".sk-close").focus({ preventScroll: true });
}

/** Markup for the flame button in the dashboard top bar. */
export function streakButtonMarkup() {
  return `
    <button type="button" id="streakBtn" class="sd-streak-btn" data-state="none"
            aria-label="Day streak">
      ${flameSvg(22)}
      <span class="sd-streak-num" id="streakBtnNum">0</span>
    </button>`;
}

/** Updates the top-bar button once the streak is known. */
export function updateStreakButton({ streak = 0, doneToday = false } = {}) {
  const btn = document.getElementById("streakBtn");
  if (!btn) return;

  btn.dataset.state = streak === 0 ? "none" : doneToday ? "done" : "risk";
  const num = document.getElementById("streakBtnNum");
  if (num) num.textContent = String(streak);

  btn.setAttribute(
    "aria-label",
    streak === 0
      ? "No streak yet"
      : `${streak} day streak${doneToday ? ", done for today" : ", not done today"}`,
  );
}
