import { logoutUser } from "../auth.js";
import { renderPracticeArena } from "./practice.js";
import { renderMarketplace } from "./marketplace.js";
import { renderMyQuizzes } from "./myQuizzes.js";
import { renderFriendGroups } from "./friendGroups.js";
import { getRecentAttempts, getStreakInfo } from "./attemptsService.js";
import {
  listenToNotificationsForUser,
  markNotificationsSeen,
  dismissNotificationForUser,
  countUnread,
  formatNotificationTime,
} from "../notificationsService.js";
import {
  initPushNotifications,
  requestPushPermission,
} from "../pushNotifications.js";
import {
  renderRecentAttemptsMarkup,
  renderScoreTrendChartMarkup,
} from "./analyticsWidgets.js";
import {
  prefersReducedMotion,
  initScrollReveal,
  animateCountUp,
} from "./scrollEffects.js";

const app = document.getElementById("app");

const DEFAULT_HERO_MESSAGE =
  "Master one quiz today and keep your streak alive.";

// How many notifications the bell panel shows at once. The live
// listener (see startNotificationsListener) fetches a larger batch
// than this since some of what comes back may already be dismissed
// and get filtered out.
const NOTIF_DISPLAY_LIMIT = 7;

// The notifications currently rendered in the panel — kept around
// so dismissing one can update the badge/list in place without
// waiting on the listener to fire again (dismissal doesn't touch
// the notifications collection, so the listener wouldn't re-fire
// from it anyway).
let renderedNotifications = [];

// Unsubscribes the previous live listener before starting a new one
// — same leak-prevention idea as outsideClickHandler/notifCloseHandler
// below, just for a Firestore subscription instead of a DOM listener.
let unsubscribeNotifications = null;

// Re-bound on every render (see setupNotifBell) so a student
// bouncing back to the dashboard a few times in one session never
// ends up with duplicate listeners stacked on document/window.
let outsideClickHandler = null;
let notifCloseHandler = null;

/* Line icons (24px grid, 1.75 stroke) — sharp joins to match the
   square-edged look, and they inherit colour from the parent. */
const ICON = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>',
  practice:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>',
  market:
    '<path d="M4 8h16l-1.2 11H5.2L4 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  quizzes: '<path d="M5 4h11l3 3v13H5V4Z"/><path d="M9 11h6M9 15h6"/>',
  groups:
    '<circle cx="9" cy="9" r="3"/><path d="M3.5 19v-1a5.5 5.5 0 0 1 11 0v1"/><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 13.3A5.5 5.5 0 0 1 20.5 18v1"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21h4"/>',
  out: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M9 12h10"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

function icon(name, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${ICON[name]}</svg>`;
}

const NAV_ITEMS = [
  { go: "home", label: "Home", short: "Home", icon: "home" },
  { go: "practice", label: "Practice Arena", short: "Practice", icon: "practice" },
  { go: "marketplace", label: "Marketplace", short: "Market", icon: "market" },
  { go: "quizzes", label: "My Quizzes", short: "Quizzes", icon: "quizzes" },
  { go: "groups", label: "Friend Groups", short: "Groups", icon: "groups" },
];

const MODULES = [
  {
    go: "practice",
    title: "Practice Arena",
    text: "Timed, exam-style sets drawn from the quizzes you own. Choose the subject, question count and clock.",
    cta: "Start a session",
    accent: "var(--sd-teal)",
  },
  {
    go: "quizzes",
    title: "My Quizzes",
    text: "Every weekly quiz you have purchased, ready to attempt whenever you are.",
    cta: "Open library",
    accent: "var(--sd-sand)",
  },
  {
    go: "marketplace",
    title: "Marketplace",
    text: "Browse this week's quizzes and add new ones to your library.",
    cta: "Browse quizzes",
    accent: "#4f9fc0",
  },
  {
    go: "groups",
    title: "Friend Groups",
    text: "Squad up, climb the leaderboard and chase the weekly Global Challenge prize.",
    cta: "Compete",
    accent: "var(--sd-green)",
  },
];

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function renderStudentDashboard(userData = {}) {
  const purchasedCount = userData.purchasedQuizzes?.length || 0;
  const firstName = (userData.name || "").trim().split(/\s+/)[0];

  const navMarkup = (variant) =>
    NAV_ITEMS.map(
      (item) => `
        <button
          type="button"
          class="sd-nav-item${item.go === "home" ? " is-active" : ""}"
          data-go="${item.go}"
          ${item.go === "home" ? 'aria-current="page"' : ""}
        >
          ${icon(item.icon, variant === "side" ? 18 : 22)}
          <span>${variant === "side" ? item.label : item.short}</span>
        </button>`,
    ).join("");

  app.innerHTML = `
    <div class="sd">

      <aside class="sd-side" aria-label="Main navigation">
        <div class="sd-brand">
          <span class="sd-brand-mark">Q</span>
          <span class="sd-brand-name">Quiz Arena</span>
        </div>

        <nav class="sd-side-nav">${navMarkup("side")}</nav>

        <div class="sd-side-foot">
          <div class="sd-user">
            <span class="sd-avatar">${escapeHtml((firstName || "S").charAt(0).toUpperCase())}</span>
            <span class="sd-user-name">${escapeHtml(userData.name || "Student")}</span>
          </div>
          <button type="button" class="sd-signout" data-logout>
            ${icon("out", 16)}<span>Sign out</span>
          </button>
        </div>
      </aside>

      <main class="sd-main">

        <header class="sd-top">
          <div class="sd-top-text">
            <p class="sd-eyebrow">${greetingForNow()}</p>
            <h1>${firstName ? escapeHtml(firstName) : "Welcome back"}</h1>
          </div>

          <div class="sd-top-actions">
            <button type="button" class="sd-signout sd-signout-mobile" data-logout aria-label="Sign out">
              ${icon("out", 18)}
            </button>
            <div class="notif-bell-wrap">
              <button id="notifBell" class="notif-bell" aria-label="Notifications">
                ${icon("bell", 20)}
                <span id="notifBadge" class="notif-badge" hidden></span>
              </button>
            </div>
          </div>
        </header>

        <section class="sd-panel sd-stats load-in" aria-label="Your progress">

          <div class="sd-goal">
            <div class="sd-goal-row">
              <span class="sd-label">Daily goal · 1 quiz</span>
              <span class="sd-goal-pct" id="goalPct">0%</span>
            </div>
            <div class="sd-goal-track"><div class="sd-goal-fill" id="goalFill"></div></div>
          </div>

          <div class="sd-stat-row">
            <div class="sd-stat">
              <strong id="purchasedCountValue" data-count-target="${purchasedCount}">0</strong>
              <span>Quizzes owned</span>
            </div>

            <div class="sd-stat stat-card streak-card" id="streakCard">
              <strong id="streakValue">--</strong>
              <span>Day streak</span>
              <em class="streak-subtitle" id="streakSubtitle"></em>
            </div>

            <div class="sd-stat">
              <strong id="lastScoreValue">--</strong>
              <span>Last score</span>
            </div>

            <div class="sd-stat">
              <strong id="avgScoreValue">--</strong>
              <span>Recent average</span>
            </div>
          </div>
        </section>

        <button type="button" class="sd-cta load-in" data-go="practice">
          <span class="sd-cta-text">
            <span class="sd-cta-title">Start practising</span>
            <span class="sd-cta-sub" id="heroMessage">${DEFAULT_HERO_MESSAGE}</span>
          </span>
          <span class="sd-cta-arrow">${icon("arrow", 22)}</span>
        </button>

        <section aria-label="Sections">
          <div class="sd-head">
            <h2>Jump in</h2>
          </div>
          <div class="sd-modules">
            ${MODULES.map(
              (m, i) => `
              <button type="button" class="sd-module load-in" data-go="${m.go}" style="--accent:${m.accent}">
                <span class="sd-module-index">0${i + 1}</span>
                <span class="sd-module-title">${m.title}</span>
                <span class="sd-module-text">${m.text}</span>
                <span class="sd-module-cta">${m.cta}${icon("arrow", 16)}</span>
              </button>`,
            ).join("")}
          </div>
        </section>

        <div class="sd-cols">

          <section class="sd-panel reveal" data-reveal>
            <div class="sd-head">
              <h2>Score trend</h2>
              <span class="sd-label">Last 5 attempts</span>
            </div>
            <div id="scoreTrendContainer" class="score-trend-container">
              <p class="sd-loading">Loading…</p>
            </div>
          </section>

          <section class="sd-panel reveal" data-reveal>
            <div class="sd-head">
              <h2>Recent activity</h2>
            </div>
            <div id="recentActivityContainer">
              <p class="sd-loading">Loading…</p>
            </div>
          </section>

        </div>

      </main>

      <nav class="sd-tabbar" aria-label="Main navigation">${navMarkup("tab")}</nav>

    </div>
  `;

  setupDashboardEvents(userData);
  initDashboardEffects();
  loadAnalytics(userData);

  startNotificationsListener(userData);
  initPushNotifications(userData.id);
}

/* =========================================================
   ANALYTICS
   Loaded async after the initial render. Guarded against the
   student having already navigated to another page (Practice,
   Marketplace, etc.) by the time the Firestore read finishes —
   same class of bug fixed earlier in the admin dashboard, where
   a stale async load tried to write into DOM nodes that had
   already been replaced.
========================================================= */
async function loadAnalytics(userData) {
  const [attempts, streakInfo] = await Promise.all([
    getRecentAttempts(userData.id, 5),
    getStreakInfo(userData.id),
  ]);

  const trendContainer = document.getElementById("scoreTrendContainer");
  const activityContainer = document.getElementById("recentActivityContainer");
  const heroMessage = document.getElementById("heroMessage");
  const streakEl = document.getElementById("streakValue");

  if (trendContainer) {
    trendContainer.innerHTML = renderScoreTrendChartMarkup(attempts);
  }

  if (activityContainer) {
    activityContainer.innerHTML = renderRecentAttemptsMarkup(attempts);
  }

  if (heroMessage) {
    updateHeroMessage(heroMessage, attempts);
  }

  const lastEl = document.getElementById("lastScoreValue");
  const avgEl = document.getElementById("avgScoreValue");
  if (lastEl && avgEl) {
    if (attempts && attempts.length) {
      const avg = Math.round(
        attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length,
      );
      lastEl.textContent = `${attempts[0].percentage}%`;
      avgEl.textContent = `${avg}%`;
    } else {
      lastEl.textContent = "—";
      avgEl.textContent = "—";
    }
  }

  if (streakEl) {
    updateStreakCard(streakEl, streakInfo);
  }
}

/**
 * Storytelling: the hero message adapts to what the student has
 * actually been doing, using the same attempts data already
 * fetched for the score trend — first quiz, on a streak, or a
 * gentle nudge to keep practicing, instead of one static line
 * every time.
 */
function updateHeroMessage(el, attempts) {
  const message = pickHeroMessage(attempts);
  if (message === DEFAULT_HERO_MESSAGE) return;

  if (prefersReducedMotion()) {
    el.textContent = message;
    return;
  }

  el.classList.add("message-updating");
  setTimeout(() => {
    el.textContent = message;
    el.classList.remove("message-updating");
  }, 300);
}

function pickHeroMessage(attempts) {
  if (!attempts || attempts.length === 0) {
    return "Ready to take your first quiz? Let's get started 🚀";
  }

  if (attempts.length === 1) {
    return "Nice start! Keep going to build your streak 💪";
  }

  const [latest, previous] = attempts;
  if (latest.percentage > previous.percentage) {
    return "You're on a roll — your scores are trending up 🔥";
  }

  if (latest.percentage === previous.percentage) {
    return "Staying consistent — keep that momentum going 📈";
  }

  return "Every attempt makes you sharper — let's practice more 💪";
}

/**
 * Fills in the Day Streak stat card once the count is known, with
 * the same count-up treatment as the Purchased Quizzes card, plus a
 * looping flame pulse (CSS: .streak-active) while the streak is
 * alive. Also sets a status subtitle so the card actually tells the
 * student something actionable:
 *   - no streak yet        -> encourages starting one
 *   - done today           -> confirms today is locked in (calm/green)
 *   - alive but not today  -> "at risk" nudge (amber) to act today
 *     before it resets — same calendar-day logic as
 *     getStreakInfo()/attemptsService.js, not a 24-hour countdown.
 */
function updateStreakCard(streakEl, { streak, doneToday }) {
  const card = streakEl.closest(".stat-card");

  if (prefersReducedMotion()) {
    streakEl.textContent = String(streak);
  } else {
    streakEl.textContent = "0";
    animateCountUp(streakEl, streak);
  }

  if (card) {
    card.classList.toggle("streak-active", streak > 0);
    card.classList.toggle("streak-done-today", streak > 0 && doneToday);
    card.classList.toggle("streak-at-risk", streak > 0 && !doneToday);
  }

  const goalFill = document.getElementById("goalFill");
  const goalPct = document.getElementById("goalPct");
  if (goalFill && goalPct) {
    const pct = doneToday ? 100 : 0;
    goalFill.style.width = `${pct}%`;
    goalPct.textContent = `${pct}%`;
  }

  const subtitleEl = document.getElementById("streakSubtitle");
  if (subtitleEl) {
    subtitleEl.textContent = streakSubtitleText(streak, doneToday);
  }
}

function streakSubtitleText(streak, doneToday) {
  if (streak === 0) return "Take a quiz today to start one!";
  if (doneToday) return "Today's done — see you tomorrow ✅";
  return "Do a quiz today to keep it alive";
}

/**
 * Subscribes to the student's notification feed in real time — the
 * panel now updates the instant a matching notification is written
 * to Firestore, same as a chat app's message list, no reload or
 * push needed for the open-tab case. Unsubscribes any previous
 * listener first, so repeat visits to the dashboard in one session
 * don't stack up multiple live connections.
 */
function startNotificationsListener(userData) {
  if (unsubscribeNotifications) {
    unsubscribeNotifications();
  }

  unsubscribeNotifications = listenToNotificationsForUser(
    userData.id,
    userData.createdAt,
    (notifications) => {
      const dismissed = userData.dismissedNotificationIds || [];
      const visible = notifications
        .filter((n) => !dismissed.includes(n.id))
        .slice(0, NOTIF_DISPLAY_LIMIT);

      renderedNotifications = visible;
      renderNotifications(userData, visible);
    },
  );
}

/**
 * Paints the bell panel + unread badge from whatever's currently in
 * renderedNotifications. Separate from refreshNotifications() so a
 * dismiss can repaint instantly from local state, without waiting
 * on a refetch.
 */
function renderNotifications(userData, notifications) {
  const listEl = document.getElementById("notifList");
  const badge = document.getElementById("notifBadge");

  if (listEl) {
    listEl.innerHTML = renderNotificationsMarkup(notifications);
    wireNotifDeleteButtons(userData, listEl);
  }

  if (badge) {
    const unread = countUnread(notifications, userData.lastNotificationsSeenAt);

    if (unread > 0) {
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
}

function renderNotificationsMarkup(notifications) {
  if (!notifications || notifications.length === 0) {
    return `<p class="notif-empty">No notifications yet.</p>`;
  }

  return notifications
    .map(
      (n) => `
        <div class="notif-item">
          <div class="notif-item-main">
            <p class="notif-message">${escapeHtml(n.message)}</p>
            <span class="notif-time">${formatNotificationTime(n.createdAt)}</span>
          </div>
          <button
            class="notif-item-delete"
            data-id="${n.id}"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      `,
    )
    .join("");
}

function wireNotifDeleteButtons(userData, listEl) {
  listEl.querySelectorAll(".notif-item-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDismiss(userData, btn.dataset.id);
    });
  });
}

/**
 * Optimistic dismiss: updates the panel immediately from local
 * state (both the in-memory list and userData's own
 * dismissedNotificationIds, so it stays hidden even if
 * refreshNotifications() runs again later in this session), then
 * writes the dismissal to Firestore in the background.
 */
function handleDismiss(userData, id) {
  if (!id) return;

  renderedNotifications = renderedNotifications.filter((n) => n.id !== id);
  userData.dismissedNotificationIds = [
    ...(userData.dismissedNotificationIds || []),
    id,
  ];

  renderNotifications(userData, renderedNotifications);

  dismissNotificationForUser(userData.id, id);
}

function setupDashboardEvents(userData) {
  const routes = {
    practice: () => renderPracticeArena(userData),
    marketplace: () => renderMarketplace(userData),
    quizzes: () => renderMyQuizzes(userData),
    groups: () => renderFriendGroups(userData),
    home: () => window.scrollTo({ top: 0, behavior: "smooth" }),
  };

  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", () => routes[el.dataset.go]?.());
  });

  document.querySelectorAll("[data-logout]").forEach((el) => {
    el.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to logout?")) return;
      await logoutUser();
    });
  });

  setupNotifBell(userData);
}

/* =========================================================
   NOTIFICATION BELL

   The panel is deliberately NOT nested inside .dashboard-hero in
   the markup above — that box has overflow:hidden (needed to clip
   the decorative purple parallax shapes at its rounded edges), so
   an absolutely-positioned dropdown inside it gets clipped too and
   is invisible below a certain height. Instead the panel is built
   here and appended straight to document.body, then positioned
   with fixed coordinates computed from the bell's on-screen
   position — same "escape the parent so it can't get clipped/
   trapped" idea as dangerDialog.js appending its overlay to
   document.body instead of the admin tab content.
========================================================= */
function setupNotifBell(userData) {
  // This page fully rebuilds on every renderStudentDashboard()
  // call (app.innerHTML is replaced), but a body-appended panel
  // from a previous render wouldn't be — remove any leftover one
  // before building a fresh one.
  document.getElementById("notifPanel")?.remove();

  const panel = document.createElement("div");
  panel.id = "notifPanel";
  panel.className = "notif-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="notif-panel-header">Notifications</div>
    <div id="notifList" class="notif-list">
      <p class="notif-empty">Loading...</p>
    </div>
  `;
  document.body.appendChild(panel);

  const bell = document.getElementById("notifBell");

  bell?.addEventListener("click", (e) => {
    e.stopPropagation();

    const opening = panel.hidden;

    if (opening) {
      positionNotifPanel(panel, bell);

      // Only ask if the student has never answered the permission
      // prompt — this click is the real user gesture some browsers
      // (Safari especially) require for that prompt to fire at all.
      if (window.Notification && Notification.permission === "default") {
        requestPushPermission(userData.id);
      }
    }

    panel.hidden = !opening;

    if (opening) {
      document.getElementById("notifBadge")?.setAttribute("hidden", "");
      markNotificationsSeen(userData.id);
    }
  });

  if (outsideClickHandler) {
    document.removeEventListener("click", outsideClickHandler);
  }

  outsideClickHandler = (e) => {
    const currentPanel = document.getElementById("notifPanel");
    const currentBell = document.getElementById("notifBell");

    if (!currentPanel || currentPanel.hidden) return;
    if (currentPanel.contains(e.target) || currentBell?.contains(e.target)) {
      return;
    }

    currentPanel.hidden = true;
  };

  document.addEventListener("click", outsideClickHandler);

  // A fixed-position panel would otherwise drift out of place under
  // the bell as soon as the page scrolls or resizes — simplest fix
  // is to just close it, same as clicking outside.
  if (notifCloseHandler) {
    window.removeEventListener("scroll", notifCloseHandler, true);
    window.removeEventListener("resize", notifCloseHandler);
  }

  notifCloseHandler = (e) => {
    const currentPanel = document.getElementById("notifPanel");
    if (!currentPanel || currentPanel.hidden) return;

    // capture:true on window sees EVERY scroll event on the page,
    // including the .notif-list scrolling inside its own
    // overflow-y:auto — not just the page scrolling behind it.
    // Without this check, scrolling the list itself closed the
    // panel on the very first pixel of scroll.
    if (currentPanel.contains(e.target)) return;

    currentPanel.hidden = true;
  };

  window.addEventListener("scroll", notifCloseHandler, true);
  window.addEventListener("resize", notifCloseHandler);
}

function positionNotifPanel(panel, bell) {
  const rect = bell.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth * 0.8);
  const gap = 8;
  const margin = 12;

  let left = rect.right - width;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  panel.style.top = `${rect.bottom + gap}px`;
  panel.style.left = `${left}px`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* =========================================================
   VISUAL EFFECTS
   Reveal, parallax, and count-up now live in the shared
   scrollEffects.js module (also used by landing.js) — no longer
   duplicated here. 
========================================================= */
function initDashboardEffects() {
  initScrollReveal();

  const countEl = document.getElementById("purchasedCountValue");
  if (countEl) {
    animateCountUp(countEl, Number(countEl.dataset.countTarget) || 0);
  }
}
