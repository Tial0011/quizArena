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
  getGlobalLeaderboard,
  findGlobalRank,
  LEADERBOARD_SUBJECT,
} from "./friendGroupService.js";

let currentUserData = {};
let globalRankedCache = []; // full ranked list, used to look up any member's global rank

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
        <p>
          Invite your squad on ${LEADERBOARD_SUBJECT} — the ₦500 reward is
          based on the official global leaderboard, not your squad alone.
        </p>
      </header>
<div class="friend-group-info-card">

  <div class="info-title">
    💡 How Friend Groups Work
  </div>

  <ul>
    <li>Join a group with at least <strong>3 members</strong> to qualify for the Global Leaderboard.</li>
    <li>Your final score is based mostly on <strong>your own performance</strong>.</li>
    <li>Your teammates' average score gives you a <strong>small bonus (15%)</strong>.</li>
    <li>If you're in multiple qualifying groups, Quiz Arena automatically uses the one that gives you the <strong>highest ranking</strong>.</li>
    <li>Invite strong teammates—the better your squad performs, the higher everyone can climb.</li>
  </ul>

</div>
<div id="myRankingCard"></div>
      <div class="global-leaderboard-section">

  <h3>
    🌍 Global Leaderboard
    <span class="official-badge">
      Official ₦500 Competition
    </span>
  </h3>

  <div class="leaderboard-summary">

    <div class="summary-card">
      <span class="summary-value">3+</span>
      <span class="summary-label">Members Required</span>
    </div>

    <div class="summary-card">
      <span class="summary-value">85%</span>
      <span class="summary-label">Your Performance</span>
    </div>

    <div class="summary-card">
      <span class="summary-value">15%</span>
      <span class="summary-label">Team Boost</span>
    </div>

  </div>

  <div id="globalLeaderboardList">
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

  // Global leaderboard is fetched once per page load and reused both for
  // its own section and to look up each group member's global rank —
  // avoids re-fetching the entire attempts collection once per group.
  await loadGlobalLeaderboard();
  await loadMyGroups();
}

async function loadGlobalLeaderboard() {
  const { top, all } = await getGlobalLeaderboard(20);

  globalRankedCache = all;

  const myEntry = all.find((member) => member.uid === currentUserData.id);

  const myRank = findGlobalRank(all, currentUserData.id);

  renderMyRanking(myEntry, myRank);

  const container = document.getElementById("globalLeaderboardList");
  if (!container) return;

  container.innerHTML = renderGlobalLeaderboard(top);
}
function renderMyRanking(myEntry, myRank) {
  const card = document.getElementById("myRankingCard");

  if (!card) return;

  if (!myEntry) {
    card.innerHTML = `
      <div class="my-ranking-card">

        <h3>🏅 Your Ranking</h3>

        <p>
          You're not currently ranked.
        </p>

        <small>
          Join a qualifying group (3+ members) and complete an
          ${LEADERBOARD_SUBJECT} quiz to appear on the leaderboard.
        </small>

      </div>
    `;

    return;
  }

  card.innerHTML = `
    <div class="my-ranking-card">

      <h3>🏅 Your Ranking</h3>

      <div class="ranking-grid">

        <div>

          <span class="ranking-label">
            Global Rank
          </span>

          <strong>#${myRank}</strong>

        </div>

        <div>

          <span class="ranking-label">
            Average
          </span>

          <strong>${myEntry.averagePercentage}%</strong>

        </div>

      </div>

    </div>
  `;
}
function renderGlobalLeaderboard(topMembers) {
  if (topMembers.length === 0) {
    return `<div class="empty-state">No ${LEADERBOARD_SUBJECT} attempts yet — be the first!</div>`;
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
              <span class="leaderboard-name">${member.name}${isMe ? " (You)" : ""}</span>
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
          ? "• Eligible for Global Ranking"
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

      <div id="leaderboard-${group.id}" class="group-leaderboard">
        <p>Loading leaderboard...</p>
      </div>

    </div>
  `;
}

function attachShareButtons(groups) {
  document.querySelectorAll(".btn-share-code").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.code;
      const name = btn.dataset.name;

      const text = encodeURIComponent(
        `Join my "${name}" squad on Quiz Arena and let's see who tops the ${LEADERBOARD_SUBJECT} leaderboard 🔥 Use code: ${code}`,
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
        await acceptJoinRequest(
          btn.dataset.requestId,
          btn.dataset.groupId,
          btn.dataset.requesterId,
        );
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
          const globalRank = findGlobalRank(globalRankedCache, member.uid);

          return `
            <div class="leaderboard-row
    ${isMe ? "leaderboard-row-me" : ""}
    ${index === 0 ? "first-place" : ""}
    ${index === 1 ? "second-place" : ""}
    ${index === 2 ? "third-place" : ""}">
              <span class="leaderboard-rank">${medals[index] || `#${index + 1}`}</span>
              <span class="leaderboard-name">
                ${member.name}${isMe ? " (You)" : ""}
                ${globalRank ? `<span class="global-rank-badge">Global #${globalRank}</span>` : ""}
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
