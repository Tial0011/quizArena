import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";
import {
  createFriendGroup,
  requestToJoinGroup,
  getMyGroups,
  getPendingRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  getGroupLeaderboard,
  getGlobalChallengeLeaderboard,
  findGlobalRank,
} from "./friendGroupService.js";

let currentUserData = {};
let challengeRankedCache = []; // full ranked list from this week's Global Challenge, used to tag each group member's challenge rank

export async function renderFriendGroups(userData = {}) {
  history.pushState(
    {
      page: "friendGroups",
    },
    "",
    "",
  );
  await renderFriendGroupsPage(userData);
}

async function renderFriendGroupsPage(userData) {
  currentUserData = userData;

  registerBackHandler(() => {
    renderStudentDashboard(currentUserData);
  });

  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="dashboard">

      <header class="dashboard-header">
        <h1>🏆 Friend Groups</h1>
        <p>Team up to unlock the Global Challenge and climb together.</p>
      </header>

      <div class="friend-group-info-card">
        <div class="info-title">💡 How it works</div>
        <p>
          A group of <strong>3+ members</strong> unlocks the
          <strong>Global Challenge</strong> — a ₦1000 prize that resets every
          week, across any quiz. Your own score drives it most; doing
          <strong>different quizzes</strong> (not just repeating one) earns
          you more credit, and your squad's average gives you a small nudge.
        </p>
      </div>

      <div id="challengeBanner"></div>

      <div class="global-challenge-section">

        <h3>
          🌍 Global Challenge
          <span class="challenge-badge">₦1000 This Week</span>
        </h3>

        <p class="challenge-subtitle" id="challengeSubtitle">
          Groups of 3+ only.
        </p>

        <div id="challengeLeaderboardList">
          <p>Loading...</p>
        </div>

      </div>

      <div class="friend-group-forms">

        <div class="friend-group-form-card">
          <h3>Create a Group</h3>
          <input
            id="createGroupName"
            type="text"
            placeholder="Group name (e.g. Team Physics)"
          />
          <button id="createGroupBtn" class="btn-primary">
            Create Group
          </button>
        </div>

        <div class="friend-group-form-card">
          <h3>Join a Group</h3>
          <input
            id="joinGroupCode"
            type="text"
            placeholder="Enter group code"
            maxlength="6"
            style="text-transform: uppercase;"
          />
          <button id="joinGroupBtn" class="btn-secondary">
            Join Group
          </button>
        </div>

      </div>

      <p class="group-limits-note">
        You can own 1 group and be part of up to 3 total.
      </p>

      <div id="myGroupsList" class="my-groups-list">
        <p>Loading your groups...</p>
      </div>

    </div>
  `;

  document
    .getElementById("createGroupBtn")
    .addEventListener("click", handleCreateGroup);
  document
    .getElementById("joinGroupBtn")
    .addEventListener("click", handleJoinGroup);

  // Fetched once per page load and reused both for its own section
  // and to tag each group member's challenge rank inside their
  // group's internal leaderboard.
  await loadChallengeLeaderboard();
  await loadMyGroups();
}

/**
 * Loads the Global Challenge (this week, any quiz, group-gated).
 * Populates the merged leader/your-rank banner and the top-list.
 */
async function loadChallengeLeaderboard() {
  const { top, all, weekLabel } = await getGlobalChallengeLeaderboard(10);

  challengeRankedCache = all;

  const myEntry = all.find((member) => member.uid === currentUserData.id);
  const myRank = findGlobalRank(all, currentUserData.id);

  const subtitle = document.getElementById("challengeSubtitle");
  if (subtitle) {
    subtitle.textContent = `Groups of 3+ only — resets every Monday. This week: ${weekLabel}.`;
  }

  renderChallengeBanner(top[0] || null, myEntry, myRank);

  const container = document.getElementById("challengeLeaderboardList");
  if (!container) return;

  container.innerHTML = renderLeaderboardList(top);
}

/**
 * Single compact card replacing what used to be two separate
 * cards (a "leader" banner and a "your rank" card) — leader on
 * the left, your own standing on the right, prize tag on the end.
 */
function renderChallengeBanner(topEntry, myEntry, myRank) {
  const el = document.getElementById("challengeBanner");
  if (!el) return;

  const leaderHtml = topEntry
    ? `
      <div class="challenge-banner-half">
        <span class="challenge-banner-label">🥇 Leading</span>
        <strong>${topEntry.name}</strong>
        <span class="challenge-banner-meta">${topEntry.individualAverage}% avg · ${topEntry.attemptCount} attempt${topEntry.attemptCount === 1 ? "" : "s"} · ${topEntry.varietyCount} quiz${topEntry.varietyCount === 1 ? "" : "zes"}</span>
      </div>
    `
    : `
      <div class="challenge-banner-half">
        <span class="challenge-banner-label">🥇 Leading</span>
        <strong>No one yet</strong>
        <span class="challenge-banner-meta">Be the first this week</span>
      </div>
    `;

  const meHtml = myEntry
    ? `
      <div class="challenge-banner-half">
        <span class="challenge-banner-label">📍 You</span>
        <strong>#${myRank} · ${myEntry.individualAverage}%</strong>
        <span class="challenge-banner-meta">${myEntry.attemptCount} attempt${myEntry.attemptCount === 1 ? "" : "s"} · ${myEntry.varietyCount} quiz${myEntry.varietyCount === 1 ? "" : "zes"}</span>
      </div>
    `
    : `
      <div class="challenge-banner-half">
        <span class="challenge-banner-label">📍 You</span>
        <strong>Not ranked</strong>
        <span class="challenge-banner-meta">Join a group of 3+ and attempt a quiz</span>
      </div>
    `;

  el.innerHTML = `
    <div class="challenge-banner">
      ${leaderHtml}
      <div class="challenge-banner-divider"></div>
      ${meHtml}
      <span class="challenge-banner-prize">₦1000</span>
    </div>
  `;
}

function renderLeaderboardList(topMembers) {
  if (topMembers.length === 0) {
    return `<div class="empty-state">No qualifying attempts yet this week — be the first!</div>`;
  }

  const medals = ["🥇", "🥈", "🥉"];

  return `
    <div class="leaderboard-list">
      ${topMembers
        .map((member, index) => {
          const isMe = member.uid === currentUserData.id;

          return `
           <div class="leaderboard-row
    ${isMe ? "leaderboard-row-me" : ""}
    ${index === 0 ? "first-place" : ""}
    ${index === 1 ? "second-place" : ""}
    ${index === 2 ? "third-place" : ""}">
              <span class="leaderboard-rank">${medals[index] || `#${index + 1}`}</span>
              <span class="leaderboard-name">
                ${member.name}${isMe ? " (You)" : ""}
                ${member.varietyCount > 1 ? `<span class="challenge-rank-badge">${member.varietyCount} quizzes</span>` : ""}
              </span>
              <span class="leaderboard-score">${member.averagePercentage}%</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

async function handleCreateGroup() {
  const input = document.getElementById("createGroupName");
  const name = input.value.trim();

  if (!name) {
    alert("Enter a group name.");
    return;
  }

  const btn = document.getElementById("createGroupBtn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  const result = await createFriendGroup(
    currentUserData.id,
    currentUserData.name,
    name,
  );

  btn.disabled = false;
  btn.textContent = "Create Group";

  if (!result.success) {
    alert(result.message);
    return;
  }

  input.value = "";
  alert(`Group created! Share this code with friends: ${result.code}`);
  await loadMyGroups();
}

async function handleJoinGroup() {
  const input = document.getElementById("joinGroupCode");
  const code = input.value.trim();

  if (!code) {
    alert("Enter a group code.");
    return;
  }

  const btn = document.getElementById("joinGroupBtn");
  btn.disabled = true;
  btn.textContent = "Joining...";

  const result = await requestToJoinGroup(
    code,
    currentUserData.id,
    currentUserData.email,
    currentUserData.name,
  );

  btn.disabled = false;
  btn.textContent = "Join Group";

  if (!result.success) {
    alert(result.message);
    return;
  }

  input.value = "";
  alert(`Request sent to join "${result.groupName}"! Waiting for approval.`);
}

async function loadMyGroups() {
  const groups = await getMyGroups(currentUserData.id);

  // Guard against the student having navigated away while this
  // was loading — same class of bug fixed elsewhere in this app.
  const container = document.getElementById("myGroupsList");
  if (!container) return;

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        You're not in any groups yet. Create one or join a friend's group above.
      </div>
    `;
    return;
  }

  container.innerHTML = groups
    .map((group) => renderGroupCardSkeleton(group))
    .join("");

  attachShareButtons(groups);

  // Load each group's requests (if owner) + leaderboard.
  groups.forEach((group) => loadGroupDetails(group));
}

function renderGroupCardSkeleton(group) {
  const isOwner = group.ownerId === currentUserData.id;
  const memberCount = (group.memberIds || []).length;
  const qualified = memberCount >= 3;

  return `
    <div class="friend-group-card" data-group-id="${group.id}">

    <div class="friend-group-card-header">

  <div>

    <div class="group-title-row">

      <h3>${group.name}</h3>

      <span class="group-status ${qualified ? "qualified" : "not-qualified"}">

        ${qualified ? "✅ Qualified" : "⚠ Needs More Members"}

      </span>

    </div>

    <span class="friend-group-code">

      Code:
      <strong>${group.code}</strong>

    </span>

    <div class="group-meta">

      👥 ${memberCount} Members

      ${
        qualified
          ? "• Eligible for Global Challenge"
          : `• ${3 - memberCount} more needed`
      }

    </div>

  </div>

  <button
      class="btn-share-code"
      data-code="${group.code}"
      data-name="${group.name}"
  >
      Share via WhatsApp
  </button>

</div>

      ${isOwner ? `<div id="pendingRequests-${group.id}" class="pending-requests"></div>` : ""}

      <details class="group-leaderboard-details">
        <summary>View leaderboard</summary>
        <div id="leaderboard-${group.id}" class="group-leaderboard">
          <p>Loading leaderboard...</p>
        </div>
      </details>

    </div>
  `;
}

function attachShareButtons(groups) {
  document.querySelectorAll(".btn-share-code").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.code;
      const name = btn.dataset.name;

      const text = encodeURIComponent(
        `Join my "${name}" squad on Quiz Arena and let's see who tops the Global Challenge 🔥 Use code: ${code}`,
      );

      window.open(`https://wa.me/?text=${text}`, "_blank");
    });
  });
}

async function loadGroupDetails(group) {
  const isOwner = group.ownerId === currentUserData.id;

  if (isOwner) {
    const requests = await getPendingRequests(group.id);
    const requestsContainer = document.getElementById(
      `pendingRequests-${group.id}`,
    );

    if (requestsContainer) {
      requestsContainer.innerHTML = renderPendingRequests(group.id, requests);
      attachRequestActionEvents(group.id);
    }
  }

  const leaderboard = await getGroupLeaderboard(group);
  const leaderboardContainer = document.getElementById(
    `leaderboard-${group.id}`,
  );

  if (leaderboardContainer) {
    leaderboardContainer.innerHTML = renderLeaderboard(leaderboard);
  }
}

function renderPendingRequests(groupId, requests) {
  if (requests.length === 0) return "";

  return `
    <div class="pending-requests-box">
      <h4>Pending Requests (${requests.length})</h4>
      ${requests
        .map(
          (req) => `
            <div class="pending-request-item">
              <div>
                <strong>${req.requesterName || "Unknown"}</strong>
                <span class="pending-request-email">${req.requesterEmail}</span>
              </div>
              <div class="pending-request-actions">
                <button
                  class="btn-accept"
                  data-request-id="${req.id}"
                  data-requester-id="${req.requesterId}"
                  data-group-id="${groupId}"
                >
                  Accept
                </button>
                <button class="btn-reject" data-request-id="${req.id}">
                  Reject
                </button>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function attachRequestActionEvents(groupId) {
  document
    .querySelectorAll(`#pendingRequests-${groupId} .btn-accept`)
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const result = await acceptJoinRequest(
          btn.dataset.requestId,
          btn.dataset.groupId,
          btn.dataset.requesterId,
        );
        if (!result.success) {
          alert(result.message);
        }
        await loadMyGroups();
      });
    });

  document
    .querySelectorAll(`#pendingRequests-${groupId} .btn-reject`)
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await rejectJoinRequest(btn.dataset.requestId);
        await loadMyGroups();
      });
    });
}

function renderLeaderboard(members) {
  if (members.length === 0) {
    return `<div class="empty-state">No members yet.</div>`;
  }

  const medals = ["🥇", "🥈", "🥉"];

  return `
    <div class="leaderboard-list">
      ${members
        .map((member, index) => {
          const isMe = member.uid === currentUserData.id;
          const challengeRank = findGlobalRank(
            challengeRankedCache,
            member.uid,
          );

          return `
            <div class="leaderboard-row
    ${isMe ? "leaderboard-row-me" : ""}
    ${index === 0 ? "first-place" : ""}
    ${index === 1 ? "second-place" : ""}
    ${index === 2 ? "third-place" : ""}">
              <span class="leaderboard-rank">${medals[index] || `#${index + 1}`}</span>
              <span class="leaderboard-name">
                ${member.name}${isMe ? " (You)" : ""}
                ${challengeRank ? `<span class="challenge-rank-badge">Challenge #${challengeRank}</span>` : ""}
              </span>
              <span class="leaderboard-score">
                ${member.attemptCount > 0 ? `${member.averagePercentage}%` : "No attempts yet"}
              </span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}
