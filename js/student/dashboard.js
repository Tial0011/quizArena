import { logoutUser } from "../auth.js";
import { renderPracticeArena } from "./practice.js";
import { renderMarketplace } from "./marketplace.js";
import { renderMyQuizzes } from "./myQuizzes.js";
import { renderFriendGroups } from "./friendGroups.js";
import { getRecentAttempts, getStreakCount } from "./attemptsService.js";
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
  initParallax,
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

export function renderStudentDashboard(userData = {}) {
  const purchasedCount = userData.purchasedQuizzes?.length || 0;

  app.innerHTML = `
    <div class="dashboard">

      <header class="dashboard-hero">

        <div class="dashboard-hero-shape dashboard-hero-shape-1" data-parallax-speed="0.1"></div>
        <div class="dashboard-hero-shape dashboard-hero-shape-2" data-parallax-speed="0.18"></div>

        <div class="hero-text">

          <div class="hero-top">

            <h1>
              👋 Welcome Back${userData.name ? `, ${userData.name}` : ""}
            </h1>

            <div class="notif-bell-wrap">
              <button
                id="notifBell"
                class="notif-bell"
                aria-label="Notifications"
              >
                🔔
                <span id="notifBadge" class="notif-badge" hidden></span>
              </button>
            </div>

          </div>

          <p id="heroMessage">
            ${DEFAULT_HERO_MESSAGE}
          </p>

        </div>

      </header>

      <section class="action-grid">

        <div
          class="action-card load-in"
          id="practiceBtn"
        >

          <div class="action-icon">
            🎯
          </div>

          <h3>
            Exam/Test Practice Arena
          </h3>

          <p>
            Practice questions from quizzes you've purchased with custom time and question limits like exam stimulations.
          </p>

          <span class="action-link">
            Open →
          </span>

        </div>

        <div
          class="action-card load-in"
          id="marketplaceBtn"
        >

          <div class="action-icon">
            🛒
          </div>

          <h3>
            Marketplace
          </h3>

          <p>
            Browse available weekly quizzes and purchase new ones to expand your library.
          </p>

          <span class="action-link">
            Browse →
          </span>

        </div>

        <div
          class="action-card load-in"
          id="quizzesBtn"
        >

          <div class="action-icon">
            📚
          </div>

          <h3>
            My Quizzes
          </h3>

          <p>
            View and attempt your purchased weekly quizzes anytime.
          </p>

          <span class="action-link">
            Open →
          </span>

        </div>

        <div
          class="action-card load-in"
          id="friendGroupsBtn"
        >

          <div class="action-icon">
            🏆
          </div>

          <h3>
            Friend Groups
          </h3>

          <p>
            Create or join a squad and see who tops the leaderboard.
          </p>

          <span class="action-link">
            Compete →
          </span>

        </div>

      </section>

      <section class="stats-grid">

        <div class="stat-card load-in">

          <span class="stat-icon">
            📦
          </span>

          <h2 id="purchasedCountValue" data-count-target="${purchasedCount}">
            0
          </h2>

          <p>
            Purchased Quizzes
          </p>

        </div>

        <div class="stat-card load-in">

          <span class="stat-icon">
            🔥
          </span>

          <h2 id="streakValue">
            --
          </h2>

          <p>
            Day Streak
          </p>

        </div>

      </section>

      <section class="dashboard-section reveal" data-reveal>

        <div class="section-header">

          <h2>
            📊 Score Trend
          </h2>

        </div>

        <div id="scoreTrendContainer" class="score-trend-container">
          <p>Loading...</p>
        </div>

      </section>

      <section class="dashboard-section reveal" data-reveal>

        <div class="section-header">

          <h2>
            📈 Recent Activity
          </h2>

        </div>

        <div id="recentActivityContainer">
          <p>Loading...</p>
        </div>

      </section>

      <button
        id="logoutBtn"
        class="logout-btn"
      >
        Logout
      </button>

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
  const [attempts, streakCount] = await Promise.all([
    getRecentAttempts(userData.id, 5),
    getStreakCount(userData.id),
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

  if (streakEl) {
    updateStreakCard(streakEl, streakCount);
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
 * the same count-up treatment as the Purchased Quizzes card, plus
 * a looping flame pulse (CSS: .streak-active) while the streak is
 * alive. Nothing to animate for a 0 streak, so it just settles.
 */
function updateStreakCard(streakEl, streakCount) {
  const card = streakEl.closest(".stat-card");

  if (prefersReducedMotion()) {
    streakEl.textContent = String(streakCount);
  } else {
    streakEl.textContent = "0";
    animateCountUp(streakEl, streakCount);
  }

  if (card) {
    card.classList.toggle("streak-active", streakCount > 0);
  }
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
  document.getElementById("practiceBtn")?.addEventListener("click", () => {
    renderPracticeArena(userData);
  });

  document.getElementById("marketplaceBtn")?.addEventListener("click", () => {
    renderMarketplace(userData);
  });

  document.getElementById("quizzesBtn")?.addEventListener("click", () => {
    renderMyQuizzes(userData);
  });

  document.getElementById("friendGroupsBtn")?.addEventListener("click", () => {
    renderFriendGroups(userData);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    const confirmLogout = confirm("Are you sure you want to logout?");

    if (!confirmLogout) return;

    await logoutUser();
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
   duplicated here. Only the action-card 3D tilt is
   dashboard-specific, so it stays local.
========================================================= */
function initDashboardEffects() {
  initParallax();
  initScrollReveal();
  initCardTilt();

  const countEl = document.getElementById("purchasedCountValue");
  if (countEl) {
    animateCountUp(countEl, Number(countEl.dataset.countTarget) || 0);
  }
}

/**
 * Subtle 3D tilt on the action cards, following the cursor.
 * Desktop only — touch devices don't fire mousemove anyway, but
 * the capability check keeps this from doing any work at all on
 * mobile rather than relying on that alone.
 */
function initCardTilt() {
  if (prefersReducedMotion()) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  document.querySelectorAll(".action-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -3;
      const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 3;

      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}
