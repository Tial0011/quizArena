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
  LEADERBOARD_SUBJECT,
} from "./friendGroupService.js";

let currentUserData = {};

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
        <p>Compete with friends on ${LEADERBOARD_SUBJECT} this week.</p>
      </header>

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

  await loadMyGroups();
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

  return `
    <div class="friend-group-card" data-group-id="${group.id}">

      <div class="friend-group-card-header">
        <div>
          <h3>${group.name}</h3>
          <span class="friend-group-code">Code: <strong>${group.code}</strong></span>
        </div>
        <button class="btn-share-code" data-code="${group.code}" data-name="${group.name}">
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

          return `
            <div class="leaderboard-row ${isMe ? "leaderboard-row-me" : ""}">
              <span class="leaderboard-rank">${medals[index] || `#${index + 1}`}</span>
              <span class="leaderboard-name">${member.name}${isMe ? " (You)" : ""}</span>
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
