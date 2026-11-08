import { renderSubjects } from "./subjects.js";
import { renderQuizzes } from "./quizzes.js";
import { renderQuestions } from "./questions.js";
import { renderNotifications } from "./notifications.js";
import { logoutUser } from "../auth.js";
import { themeToggleButton } from "../theme.js";
import { db } from "../firebase/config.js";
import { initParallax, initScrollReveal } from "../student/scrollEffects.js";
import { callNetlifyFunction } from "../firebase/netlifyFunctions.js";

import {
  collection,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  Timestamp,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ONLINE_WINDOW_MS } from "../activityTracker.js";

const app = document.getElementById("app");

let activeTab = "dashboard";
const FRIEND_GROUP_PAGE_SIZE = 10;
let friendGroupPageCursors = [null];
let friendGroupPageRequest = 0;
let friendGroupPage = 0;
let friendGroupDataById = new Map();

// Live user-activity numbers refresh on their own while the Dashboard
// tab is open. Cleared whenever the tab content is re-rendered.
const USER_STATS_REFRESH_MS = 60 * 1000;
let userStatsTimer = null;

// Icon + copy for each activity source. Keyed by the same "type"
// tag pushed onto events in loadRecentActivity() below.
const ACTIVITY_META = {
  subject: { icon: "📚", verb: "New subject added" },
  quiz: { icon: "📝", verb: "New quiz created" },
  question: { icon: "❓", verb: "New question added" },
};

export function renderAdminDashboard() {
  app.innerHTML = `
    <div class="admin-wrap">

      <header class="admin-header">

        <div class="admin-header-shape admin-header-shape-1" data-parallax-speed="0.1"></div>
        <div class="admin-header-shape admin-header-shape-2" data-parallax-speed="0.18"></div>

        <img
          src="../../icons/icon-192.png"
          alt="Quiz Arena"
          class="admin-logo"
        />

        <div class="admin-header-text">
          <span class="admin-eyebrow">Administration Console</span>
          <h1>Quiz Arena Admin</h1>
          <p>Manage quizzes, subjects and students.</p>
        </div>

        ${themeToggleButton("admin-theme")}
        <button id="adminLogoutBtn" class="admin-logout-btn">
          Logout
        </button>

      </header>

      <nav class="admin-tabs">

        <button
          class="tab-btn ${activeTab === "dashboard" ? "active" : ""}"
          data-tab="dashboard"
        >
          Dashboard
        </button>

        <button
          class="tab-btn ${activeTab === "subjects" ? "active" : ""}"
          data-tab="subjects"
        >
          Subjects
        </button>

        <button
          class="tab-btn ${activeTab === "quizzes" ? "active" : ""}"
          data-tab="quizzes"
        >
          Quizzes
        </button>

        <button
          class="tab-btn ${activeTab === "questions" ? "active" : ""}"
          data-tab="questions"
        >
          Questions
        </button>

        <button
          class="tab-btn ${activeTab === "notifications" ? "active" : ""}"
          data-tab="notifications"
        >
          Notifications
        </button>

        <button
          class="tab-btn ${activeTab === "weeklyPrizes" ? "active" : ""}"
          data-tab="weeklyPrizes"
        >
          Weekly Prizes
        </button>

        <button
          class="tab-btn ${activeTab === "community" ? "active" : ""}"
          data-tab="community"
        >
          Community
        </button>

      </nav>

      <main id="adminContent"></main>
      <div id="adminLoadingOverlay" class="admin-loading-overlay" role="status" aria-live="polite" aria-hidden="true">
        <span class="admin-loading-spinner" aria-hidden="true"></span>
        <span>Loading admin dashboard…</span>
      </div>

    </div>
  `;

  setupTabs();

  renderTabContent();
  setupLogout();
  initAdminEffects();
}

function initAdminEffects() {
  initParallax();
  initScrollReveal();
}

function setupLogout() {
  document
    .getElementById("adminLogoutBtn")
    ?.addEventListener("click", async () => {
      const confirmLogout = confirm("Are you sure you want to logout?");

      if (!confirmLogout) return;

      await logoutUser();
    });
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;

      renderAdminDashboard();
    });
  });
}

async function renderTabContent() {
  setAdminLoading(true);
  try {
  const content = document.getElementById("adminContent");

  clearInterval(userStatsTimer);
  userStatsTimer = null;

  switch (activeTab) {
    case "dashboard":
      content.innerHTML = `
        <div class="admin-card load-in">

          <h2>Overview</h2>
          <p>Welcome back! Here's what's happening today.</p>

          <div class="overview-grid">

            <div class="overview-card load-in">
              <div class="overview-icon">📚</div>
              <div class="overview-info">
                <h3 id="subjectCount">--</h3>
                <p>Subjects</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">📝</div>
              <div class="overview-info">
                <h3 id="quizCount">--</h3>
                <p>Quizzes This Week</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">📋</div>
              <div class="overview-info">
                <h3 id="totalQuizCount">--</h3>
                <p>Total Quizzes</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">🛒</div>
              <div class="overview-info">
                <h3 id="purchasedQuizCount">--</h3>
                <p>Quizzes Bought</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">❓</div>
              <div class="overview-info">
                <h3 id="questionCount">--</h3>
                <p>Questions</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">👨‍🎓</div>
              <div class="overview-info">
                <h3 id="studentCount">--</h3>
                <p>Students</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">💰</div>
              <div class="overview-info">
                <h3 id="revenueTotal">--</h3>
                <p>Verified Revenue</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">₦</div>
              <div class="overview-info">
                <h3 id="weeklyRevenue">--</h3>
                <p>This Week</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">▦</div>
              <div class="overview-info">
                <h3 id="monthlyRevenue">--</h3>
                <p>This Month</p>
              </div>
            </div>

            <div class="overview-card load-in">
              <div class="overview-icon">🔥</div>
              <div class="overview-info">
                <h3 id="topQuizName" class="overview-info-topquiz">--</h3>
                <p>Top Selling Quiz</p>
              </div>
            </div>

          </div>

        </div>

        <div class="admin-card load-in">
          <h2>How students found us</h2>
          <p>Referral answers from new email and Google sign-ups.</p>
          <div class="overview-grid" id="referralSourceStats">
            <div class="overview-card"><div class="overview-info"><h3>--</h3><p>LinkedIn</p></div></div>
            <div class="overview-card"><div class="overview-info"><h3>--</h3><p>WhatsApp</p></div></div>
            <div class="overview-card"><div class="overview-info"><h3>--</h3><p>TikTok</p></div></div>
            <div class="overview-card"><div class="overview-info"><h3>--</h3><p>Google</p></div></div>
          </div>
        </div>

        <div class="admin-card load-in">

          <div class="admin-card-head">
            <h2>User Activity</h2>
            <button id="refreshUserStats" class="admin-refresh-btn" type="button">
              ↻ Refresh
            </button>
          </div>
          <p>
            <span class="live-dot"></span>
            Live numbers — updates every minute.
          </p>

          <div class="overview-grid">
            ${[
              ["🟢", "statOnline", "Online now", "last 5 min"],
              ["⚡", "statActive24h", "Active users", "last 24 hours"],
              ["📅", "statActive7d", "Active users", "last 7 days"],
              ["🔑", "statLoginsToday", "Logins", "today"],
              ["🔐", "statLogins7d", "Logins", "last 7 days"],
              ["🆕", "statNewToday", "New users", "today"],
              ["✨", "statNew7d", "New users", "last 7 days"],
              ["📈", "statNew30d", "New users", "last 30 days"],
            ]
              .map(
                ([icon, id, label, sub]) => `
            <div class="overview-card load-in">
              <div class="overview-icon">${icon}</div>
              <div class="overview-info">
                <h3 id="${id}">--</h3>
                <p>${label}<span class="overview-sub"> · ${sub}</span></p>
              </div>
            </div>`,
              )
              .join("")}
          </div>

        </div>

        <div class="admin-card reveal" data-reveal>

          <h2>Recent Logins</h2>

          <div class="activity-list" id="loginList">
            <div class="activity-item activity-item-loading">
              Loading recent logins…
            </div>
          </div>

        </div>

        <div class="admin-card reveal" data-reveal>

          <h2>Recent Activity</h2>

          <div class="activity-list" id="activityList">
            <div class="activity-item activity-item-loading">
              Loading recent activity…
            </div>
          </div>

        </div>
      `;

      // Re-run reveal/parallax now that this tab's markup (with its
      // own .reveal / data-parallax-speed nodes) exists in the DOM.
      initAdminEffects();

      document
        .getElementById("refreshUserStats")
        ?.addEventListener("click", loadUserActivityStats);

      userStatsTimer = setInterval(loadUserActivityStats, USER_STATS_REFRESH_MS);

      await Promise.all([
        loadDashboardStats(),
        loadRevenueStats(),
        loadReferralSourceStats(),
        loadRecentActivity(),
        loadUserActivityStats(),
      ]);

      break;

    case "subjects":
      await renderSubjects(content);
      break;

    case "quizzes":
      await renderQuizzes(content);
      break;

    case "questions":
      await renderQuestions(content);
      break;

    case "notifications":
      await renderNotifications(content);
      break;

    case "weeklyPrizes":
      await renderWeeklyPrizes(content);
      break;

    case "community":
      friendGroupPageCursors = [null];
      friendGroupPage = 0;
      friendGroupDataById = new Map();
      await renderCommunity(content);
      break;
  }
  } finally {
    setAdminLoading(false);
  }
}

async function renderCommunity(content) {
  content.innerHTML = `
    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>Global Challenge — Top 15</h2>
          <p id="communityLeaderboardSnapshot">Current weekly leaderboard. Refresh to recalculate rankings.</p>
        </div>
        <button id="refreshCommunityLeaderboard" class="admin-refresh-btn" type="button">↻ Refresh</button>
      </div>
      <div id="communityLeaderboard" class="community-list" aria-live="polite">Loading leaderboard…</div>
    </section>

    <section class="admin-card">
      <div class="admin-card-head">
        <div>
          <h2>Friend Groups</h2>
          <p>Browse groups page by page. Member profiles load only when you expand a group.</p>
        </div>
        <button id="refreshFriendGroups" class="admin-refresh-btn" type="button">↻ Refresh</button>
      </div>
      <div id="adminFriendGroups" class="community-list" aria-live="polite">Loading groups…</div>
      <div class="community-pagination">
        <button id="friendGroupsPrevious" class="admin-refresh-btn" type="button" disabled>Previous</button>
        <span id="friendGroupsPageLabel">Page 1</span>
        <button id="friendGroupsNext" class="admin-refresh-btn" type="button" disabled>Next</button>
      </div>
    </section>
  `;

  document.getElementById("refreshCommunityLeaderboard")
    ?.addEventListener("click", loadCommunityLeaderboard);
  document.getElementById("refreshFriendGroups")
    ?.addEventListener("click", () => {
      friendGroupPageCursors = [null];
      friendGroupPage = 0;
      renderFriendGroupPage(0);
    });
  document.getElementById("friendGroupsPrevious")
    ?.addEventListener("click", () => renderFriendGroupPage(Math.max(0, friendGroupPage - 1)));
  document.getElementById("friendGroupsNext")
    ?.addEventListener("click", () => renderFriendGroupPage(friendGroupPage + 1));
  document.getElementById("adminFriendGroups")
    ?.addEventListener("click", handleFriendGroupExpand);

  await Promise.all([loadCommunityLeaderboard(), renderFriendGroupPage(0)]);
}

async function loadCommunityLeaderboard() {
  const container = document.getElementById("communityLeaderboard");
  const snapshotLabel = document.getElementById("communityLeaderboardSnapshot");
  const refreshButton = document.getElementById("refreshCommunityLeaderboard");
  if (!container) return;
  if (refreshButton) refreshButton.disabled = true;
  container.textContent = "Loading leaderboard…";

  try {
    const response = await callNetlifyFunction("leaderboard", { refreshSnapshot: true });
    if (activeTab !== "community" || !container.isConnected) return;
    const top = (response.data?.top || []).slice(0, 15);
    const updatedAt = response.data?.updatedAt;
    if (snapshotLabel) {
      snapshotLabel.textContent = updatedAt
        ? `Recalculated · updated ${new Date(updatedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}`
        : "Current weekly leaderboard. Refresh to recalculate rankings.";
    }
    if (!top.length) {
      container.textContent = "No leaderboard entries are available yet.";
      return;
    }

    container.innerHTML = `
      <div class="community-leaderboard-row community-leaderboard-heading">
        <span>Rank</span><span>Student</span><span>Score</span><span>Attempts</span>
      </div>
      ${top.map((entry) => `
        <div class="community-leaderboard-row">
          <span>${Number(entry.rank) || "—"}</span>
          <span>${escapeHtml(String(entry.name || "Student"))}</span>
          <span>${Number(entry.score || 0).toFixed(2)}</span>
          <span>${Number(entry.attemptCount) || 0}</span>
        </div>
      `).join("")}
    `;
  } catch (error) {
    console.error("Failed to load admin Global Challenge leaderboard:", error);
    if (container.isConnected) container.textContent = "Could not load the leaderboard. Try again.";
  } finally {
    if (refreshButton?.isConnected) refreshButton.disabled = false;
  }
}

async function renderFriendGroupPage(pageIndex) {
  const container = document.getElementById("adminFriendGroups");
  if (!container || activeTab !== "community") return;
  const requestId = ++friendGroupPageRequest;
  container.textContent = "Loading groups…";

  const groupQuery = query(
    collection(db, "friendGroups"),
    orderBy(documentId(), "asc"),
    ...(friendGroupPageCursors[pageIndex]
      ? [startAfter(friendGroupPageCursors[pageIndex])]
      : []),
    limit(FRIEND_GROUP_PAGE_SIZE + 1),
  );

  try {
    const snapshot = await getDocs(groupQuery);
    if (
      requestId !== friendGroupPageRequest ||
      activeTab !== "community" ||
      !container.isConnected
    ) return;

    const pageDocs = snapshot.docs.slice(0, FRIEND_GROUP_PAGE_SIZE);
    const hasNextPage = snapshot.docs.length > FRIEND_GROUP_PAGE_SIZE;
    friendGroupPageCursors = friendGroupPageCursors.slice(0, pageIndex + 1);
    if (hasNextPage) friendGroupPageCursors[pageIndex + 1] = pageDocs.at(-1);
    friendGroupPage = pageIndex;
    friendGroupDataById = new Map(pageDocs.map((groupDoc) => [groupDoc.id, groupDoc.data()]));

    document.getElementById("friendGroupsPageLabel").textContent = `Page ${pageIndex + 1}`;
    document.getElementById("friendGroupsPrevious").disabled = pageIndex === 0;
    document.getElementById("friendGroupsNext").disabled = !hasNextPage;

    if (!pageDocs.length) {
      container.textContent = pageIndex === 0 ? "No friend groups have been created yet." : "No more groups.";
      return;
    }

    container.innerHTML = pageDocs.map((groupDoc) => {
      const group = groupDoc.data();
      const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
      const memberLabel = `${memberIds.length} member${memberIds.length === 1 ? "" : "s"}`;
      return `
        <article class="community-group" data-group-id="${escapeHtml(groupDoc.id)}">
          <div class="community-group-summary">
            <div>
              <h3>${escapeHtml(String(group.name || "Unnamed group"))}</h3>
              <p>Code: ${escapeHtml(String(group.code || "—"))} · ${memberLabel}</p>
              <p>Owner: ${escapeHtml(String(group.ownerName || "Student"))}</p>
            </div>
            <button type="button" class="admin-refresh-btn" data-group-toggle="${escapeHtml(groupDoc.id)}" aria-expanded="false">
              Show members
            </button>
          </div>
          <div class="community-group-members" data-group-members="${escapeHtml(groupDoc.id)}" hidden></div>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Failed to load admin friend groups:", error);
    if (requestId === friendGroupPageRequest && container.isConnected) {
      container.textContent = "Could not load friend groups. Try again.";
    }
  }
}

async function handleFriendGroupExpand(event) {
  const button = event.target.closest("[data-group-toggle]");
  if (!button) return;

  const groupId = button.dataset.groupToggle;
  const memberContainer = button.closest(".community-group")?.querySelector(".community-group-members");
  if (!memberContainer) return;
  if (!memberContainer.hidden && button.textContent !== "Retry members") {
    memberContainer.hidden = true;
    button.textContent = "Show members";
    button.setAttribute("aria-expanded", "false");
    return;
  }

  const group = friendGroupDataById.get(groupId);
  if (!group) return;
  button.disabled = true;
  button.textContent = "Loading…";
  memberContainer.hidden = false;
  button.setAttribute("aria-expanded", "true");
  memberContainer.textContent = "Loading member profiles…";

  try {
    const memberIds = [...new Set(group.memberIds || [])].filter(
      (uid) => typeof uid === "string" && uid,
    );
    if (!memberIds.length) {
      memberContainer.textContent = "This group has no members.";
      return;
    }

    const membersSnapshot = await getDocs(query(
      collection(db, "users"),
      where(documentId(), "in", memberIds),
    ));
    const usersById = new Map(membersSnapshot.docs.map((userDoc) => [
      userDoc.id,
      userDoc.data(),
    ]));
    memberContainer.innerHTML = memberIds.map((uid) => {
      const user = usersById.get(uid);
      const name = user?.name || user?.fullName || "Student";
      const username = user?.username ? `@${user.username}` : "No username";
      const owner = uid === group.ownerId ? " · Owner" : "";
      return `<div class="community-member"><span>${escapeHtml(String(name))}${owner}</span><small>${escapeHtml(String(username))}</small></div>`;
    }).join("");
    button.textContent = "Hide members";
  } catch (error) {
    console.error("Failed to load friend group members:", error);
    memberContainer.textContent = "Could not load members. Try again.";
    button.textContent = "Retry members";
  } finally {
    button.disabled = false;
  }
}

function setAdminLoading(isLoading) {
  const overlay = document.getElementById("adminLoadingOverlay");
  if (!overlay) return;
  overlay.classList.toggle("is-visible", isLoading);
  overlay.setAttribute("aria-hidden", String(!isLoading));
}

async function renderWeeklyPrizes(content) {
  content.innerHTML = `
    <div class="admin-card">
      <h2>Weekly Challenge Prizes</h2>
      <p>Winners are recorded automatically every Monday. Pay prizes manually by airtime, transfer, or data, then mark each payout here.</p>
      <div id="weeklyPrizeHistory">Loading weekly winners…</div>
    </div>`;

  try {
    const winnersSnap = await getDocs(query(collection(db, "weeklyWinners"), orderBy("weekStart", "desc"), limit(26)));
    if (activeTab !== "weeklyPrizes") return;
    const history = document.getElementById("weeklyPrizeHistory");
    if (!history) return;
    if (winnersSnap.empty) {
      history.innerHTML = `<p>No weekly winner records yet. The first record is created on Monday after a completed challenge week.</p>`;
      return;
    }
    history.innerHTML = winnersSnap.docs.map((weekDoc) => {
      const week = weekDoc.data();
      const dateRange = week.weekStart?.toDate && week.weekEnd?.toDate
        ? `${week.weekStart.toDate().toLocaleDateString()} – ${week.weekEnd.toDate().toLocaleDateString()}`
        : week.weekKey;
      const rows = (week.winners || []).map((winner) => `
        <tr>
          <td>${winner.place}</td><td>${escapeHtml(winner.name || "Student")}</td>
          <td>₦${(winner.prizeNaira || 0).toLocaleString()}</td>
          <td>${escapeHtml(winner.payoutStatus || "pending")}</td>
          <td>${winner.payoutStatus === "paid" ? escapeHtml(winner.payoutMethod || "") : `<select aria-label="Payout method" data-payout-method><option value="airtime">Airtime</option><option value="transfer">Transfer</option><option value="data">Data</option></select> <button type="button" class="admin-refresh-btn" data-paid-week="${escapeHtml(weekDoc.id)}" data-paid-uid="${escapeHtml(winner.uid)}">Mark paid</button>`}</td>
        </tr>`).join("");
      return `<section class="admin-card"><h3>${escapeHtml(week.weekKey)} <small>${dateRange}</small></h3>
        <div class="table-wrap"><table><thead><tr><th>Place</th><th>Student</th><th>Prize</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No qualifying winners</td></tr>`}</tbody></table></div></section>`;
    }).join("");
    history.querySelectorAll("[data-paid-week]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      const weekRef = doc(db, "weeklyWinners", button.dataset.paidWeek);
      const currentSnap = await getDoc(weekRef);
      if (!currentSnap.exists()) return;
      const winners = currentSnap.data().winners || [];
      const target = winners.find((winner) => winner.uid === button.dataset.paidUid);
      if (!target) return;
      target.payoutStatus = "paid";
      target.paidAt = new Date();
      target.payoutMethod = button.parentElement.querySelector("[data-payout-method]")?.value || "airtime";
      await updateDoc(weekRef, { winners });
      await renderWeeklyPrizes(content);
    }));
  } catch (error) {
    console.error("Failed to load weekly prize history:", error);
    const history = document.getElementById("weeklyPrizeHistory");
    if (history) history.textContent = "Could not load weekly winner records.";
  }
}

async function loadReferralSourceStats() {
  const sources = ["linkedin", "whatsapp", "tiktok", "google"];
  const target = document.getElementById("referralSourceStats");
  if (!target) return;
  const counts = await Promise.all(sources.map(async (source) => {
    try {
      const snap = await getCountFromServer(query(collection(db, "users"), where("referralSource", "==", source)));
      return snap.data().count;
    } catch (error) {
      console.error(`Referral source count failed for ${source}:`, error);
      return "!";
    }
  }));
  if (activeTab !== "dashboard") return;
  target.querySelectorAll(".overview-card h3").forEach((item, index) => {
    item.textContent = counts[index].toLocaleString?.() || counts[index];
  });
}

async function loadDashboardStats() {
  const weekStart = getLagosWeekStart();
  const now = Timestamp.fromDate(new Date());
  const [subjectCountSnap, quizSnap, questionCountSnap, studentCountSnap, weeklyQuizCountSnap, purchasedQuizCountSnap] = await Promise.all([
    getCountFromServer(collection(db, "subjects")),
    getDocs(collection(db, "quizzes")),
    getCountFromServer(collection(db, "questions")),
    getCountFromServer(query(collection(db, "users"), where("role", "==", "student"))),
    getCountFromServer(query(
      collection(db, "quizzes"),
      where("createdAt", ">=", Timestamp.fromDate(weekStart)),
      where("createdAt", "<=", now),
    )),
    getCountFromServer(query(
      collection(db, "purchases"),
      where("status", "==", "paid"),
    )),
  ]);

  // If the admin switched to a different tab while these reads were
  // in flight, #adminContent no longer contains the dashboard markup
  // (it now holds Subjects/Quizzes/Questions/Notifications instead).
  // Bail out here instead of trying to write into elements that
  // don't exist anymore.
  if (activeTab !== "dashboard") return;

  setStatText("subjectCount", subjectCountSnap.data().count);
  setStatText("quizCount", weeklyQuizCountSnap.data().count);
  setStatText("totalQuizCount", quizSnap.size);
  setStatText("purchasedQuizCount", purchasedQuizCountSnap.data().count);
  setStatText("questionCount", questionCountSnap.data().count);
  setStatText("studentCount", studentCountSnap.data().count);

  // Revenue totals come from verified Flutterwave transactions in
  // loadRevenueStats. Count purchases per quiz with aggregation queries so
  // the admin dashboard doesn't download every purchase document.
  const quizById = {};
  quizSnap.forEach((docSnap) => {
    quizById[docSnap.id] = docSnap.data();
  });
  const sales = await Promise.all(quizSnap.docs.map(async (quizDoc) => {
    const countSnap = await getCountFromServer(query(
      collection(db, "purchases"),
      where("status", "==", "paid"),
      where("quizId", "==", quizDoc.id),
    ));
    return [quizDoc.id, countSnap.data().count];
  }));
  const topEntry = sales.sort((a, b) => b[1] - a[1])[0];

  const topQuizEl = document.getElementById("topQuizName");
  if (topQuizEl) {
    topQuizEl.textContent = topEntry && topEntry[1] > 0
      ? (quizById[topEntry[0]]?.title ?? "Unknown quiz")
      : "No sales yet";
  }
}

async function loadRevenueStats() {
  const hourMs = 60 * 60 * 1000;
  const lagosNow = new Date(Date.now() + hourMs);
  const weekStart = getLagosWeekStart();
  const monthStart = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), 1) - hourMs);
  const now = Timestamp.fromDate(new Date());
  const transactions = collection(db, "flutterwaveTransactions");
  const sumAmount = (start) => getAggregateFromServer(
    query(
      transactions,
      where("processedAt", ">=", Timestamp.fromDate(start)),
      where("processedAt", "<=", now),
    ),
    { total: sum("amount") },
  );

  try {
    const [allTime, weekly, monthly] = await Promise.all([
      getAggregateFromServer(transactions, { total: sum("amount") }),
      sumAmount(weekStart),
      sumAmount(monthStart),
    ]);
    if (activeTab !== "dashboard") return;
    const formatNaira = (value) => `₦${Number(value || 0).toLocaleString()}`;
    setStatText("revenueTotal", formatNaira(allTime.data().total));
    setStatText("weeklyRevenue", formatNaira(weekly.data().total));
    setStatText("monthlyRevenue", formatNaira(monthly.data().total));
  } catch (error) {
    console.error("Failed to load verified revenue totals:", error);
    ["revenueTotal", "weeklyRevenue", "monthlyRevenue"].forEach((id) => setStatText(id, "!"));
  }
}

function getLagosWeekStart() {
  const hourMs = 60 * 60 * 1000;
  const lagosNow = new Date(Date.now() + hourMs);
  const localMidnight = Date.UTC(
    lagosNow.getUTCFullYear(),
    lagosNow.getUTCMonth(),
    lagosNow.getUTCDate(),
  );
  const daysSinceMonday = (new Date(localMidnight).getUTCDay() + 6) % 7;
  return new Date(localMidnight - daysSinceMonday * 24 * hourMs - hourMs);
}

// ---- User activity (online / active / logins / new users) ----
//
// Uses server-side count queries (1 read per 1000 index entries rather
// than one read per doc), so this stays cheap even with many students.
// Sources: users.lastActiveAt (heartbeat), users.createdAt (signup) and
// loginEvents.at (one doc per sign-in) — all written by
// js/activityTracker.js / js/auth.js. Accounts that haven't signed in
// since this feature shipped have no lastActiveAt yet, so "active"
// numbers fill in as people return.
async function loadUserActivityStats() {
  if (activeTab !== "dashboard") return;

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const ago = (ms) => Timestamp.fromMillis(now - ms);
  const DAY = 24 * 60 * 60 * 1000;

  const count = async (col, field, since) => {
    const snap = await getCountFromServer(
      query(collection(db, col), where(field, ">=", since)),
    );
    return snap.data().count;
  };

  const today = Timestamp.fromDate(startOfToday);

  const jobs = {
    statOnline: count("users", "lastActiveAt", ago(ONLINE_WINDOW_MS)),
    statActive24h: count("users", "lastActiveAt", ago(DAY)),
    statActive7d: count("users", "lastActiveAt", ago(7 * DAY)),
    statLoginsToday: count("loginEvents", "at", today),
    statLogins7d: count("loginEvents", "at", ago(7 * DAY)),
    statNewToday: count("users", "createdAt", today),
    statNew7d: count("users", "createdAt", ago(7 * DAY)),
    statNew30d: count("users", "createdAt", ago(30 * DAY)),
  };

  // Each tile settles on its own so one failing query (e.g. a missing
  // security rule) shows "!" on that tile instead of blanking the rest.
  await Promise.all(
    Object.entries(jobs).map(async ([id, job]) => {
      try {
        const value = await job;
        if (activeTab === "dashboard") setStatText(id, value.toLocaleString());
      } catch (err) {
        console.error(`User activity stat ${id} failed:`, err);
        if (activeTab === "dashboard") setStatText(id, "!");
      }
    }),
  );

  await loadRecentLogins();
}

async function loadRecentLogins() {
  const listEl = document.getElementById("loginList");
  if (!listEl) return;

  try {
    const snap = await getDocs(
      query(collection(db, "loginEvents"), orderBy("at", "desc"), limit(8)),
    );

    if (activeTab !== "dashboard") return;

    if (snap.empty) {
      listEl.innerHTML = `<div class="activity-item">No logins recorded yet.</div>`;
      return;
    }

    listEl.innerHTML = snap.docs
      .map((docSnap) => {
        const { email, at } = docSnap.data();
        return `
        <div class="activity-item">
          <span class="activity-icon">🔑</span>
          <span class="activity-text">${escapeHtml(email || "Unknown user")}</span>
          <span class="activity-time">${formatRelativeTime(at)}</span>
        </div>`;
      })
      .join("");
  } catch (err) {
    console.error("Failed to load recent logins:", err);
    if (activeTab === "dashboard") {
      listEl.innerHTML = `<div class="activity-item">Couldn't load recent logins right now.</div>`;
    }
  }
}

// Pulls the most recent few subjects/quizzes/questions (by createdAt)
// and merges them into a single feed. There's no dedicated "activity
// log" collection — this is a fan-out read across the three content
// collections rather than a stored event stream, so it costs 3 reads
// (well, 3 queries of `limit` docs each) per dashboard visit. Fine at
// current scale; if it ever needs to scale up, a written activity-log
// collection would be the next step instead of widening these limits.
async function loadRecentActivity() {
  const FETCH_LIMIT = 5;
  const DISPLAY_LIMIT = 6;

  let subjectSnap, quizSnap, questionSnap;

  try {
    [subjectSnap, quizSnap, questionSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "subjects"),
          orderBy("createdAt", "desc"),
          limit(FETCH_LIMIT),
        ),
      ),
      getDocs(
        query(
          collection(db, "quizzes"),
          orderBy("createdAt", "desc"),
          limit(FETCH_LIMIT),
        ),
      ),
      getDocs(
        query(
          collection(db, "questions"),
          orderBy("createdAt", "desc"),
          limit(FETCH_LIMIT),
        ),
      ),
    ]);
  } catch (err) {
    console.error("Failed to load recent activity:", err);

    if (activeTab === "dashboard") {
      renderActivityList([], "Couldn't load recent activity right now.");
    }

    return;
  }

  // Same tab-switch race as loadDashboardStats() above — bail if
  // #activityList no longer exists.
  if (activeTab !== "dashboard") return;

  const events = [
    ...subjectSnap.docs.map((docSnap) =>
      toActivityEvent("subject", docSnap.data()),
    ),
    ...quizSnap.docs.map((docSnap) => toActivityEvent("quiz", docSnap.data())),
    ...questionSnap.docs.map((docSnap) =>
      toActivityEvent("question", docSnap.data()),
    ),
  ];

  events.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

  renderActivityList(events.slice(0, DISPLAY_LIMIT));
}

function toActivityEvent(type, data) {
  const meta = ACTIVITY_META[type];

  const label =
    type === "question"
      ? truncate(data.text ?? data.question ?? "Untitled question", 60)
      : (data.title ?? data.name ?? `Untitled ${type}`);

  return {
    type,
    createdAt: data.createdAt,
    text: `${meta.verb}: ${label}`,
  };
}

function renderActivityList(events, emptyMessage) {
  const listEl = document.getElementById("activityList");
  if (!listEl) return;

  if (events.length === 0) {
    listEl.innerHTML = `<div class="activity-item">${
      emptyMessage ??
      "No activity yet — create a subject, quiz or question to get started."
    }</div>`;
    return;
  }

  listEl.innerHTML = events
    .map(
      (event) => `
        <div class="activity-item">
          <span class="activity-icon">${ACTIVITY_META[event.type].icon}</span>
          <span class="activity-text">${escapeHtml(event.text)}</span>
          <span class="activity-time">${formatRelativeTime(event.createdAt)}</span>
        </div>
      `,
    )
    .join("");
}

function toMillis(timestamp) {
  return timestamp?.toMillis ? timestamp.toMillis() : 0;
}

function formatRelativeTime(timestamp) {
  if (!timestamp?.toDate) return "";

  const diffMs = Date.now() - timestamp.toDate().getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return timestamp.toDate().toLocaleDateString();
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setStatText(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = value;
  }
}
