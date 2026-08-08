import { auth } from "../firebase/config.js";
import {
  sendNotification,
  getRecentNotifications,
  deleteNotification,
  formatNotificationTime,
} from "../notificationsService.js";

/* =========================================================
   MODULE STATE
   Same currentContainer pattern as subjects.js: every DOM
   read/write goes through currentContainer.querySelector(...),
   and every post-await write is guarded against the admin having
   switched tabs while the request was in flight.
========================================================= */
let currentContainer = null;

export async function renderNotifications(container) {
  currentContainer = container;

  container.innerHTML = `
    <div class="admin-card">

      <div class="notification-compose-section">
        <h2>Send a Notification</h2>
        <p class="subjects-subtitle">
          This goes out to every student right away — there's no way to
          target just one, so double-check the message before sending.
        </p>

        <textarea
          id="notificationMessage"
          class="notification-textarea"
          rows="3"
          placeholder="e.g. New Week 5 quizzes are live in the Marketplace!"
        ></textarea>

        <div class="subject-form-actions">
          <button id="sendNotificationBtn" class="subject-add-btn">
            📢 Send to All Students
          </button>
        </div>
      </div>

      <div class="page-header subjects-header">
        <div>
          <h2>Sent Notifications</h2>
          <p class="subjects-subtitle">Most recent broadcasts, newest first.</p>
        </div>
      </div>

      <div id="notificationsList">
        Loading...
      </div>

    </div>
  `;

  container
    .querySelector("#sendNotificationBtn")
    ?.addEventListener("click", handleSend);

  await loadNotifications();
}

async function handleSend() {
  const container = currentContainer;

  const textarea = container.querySelector("#notificationMessage");
  const message = textarea.value.trim();

  if (!message) {
    alert("Enter a message first.");
    return;
  }

  const btn = container.querySelector("#sendNotificationBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending...";
  }

  const createdBy = auth.currentUser?.email || "Admin";
  const result = await sendNotification({ message, createdBy });

  // Tab changed while the write was in flight — nothing left on
  // screen to reset or reload.
  if (currentContainer !== container || !container.isConnected) return;

  if (btn) {
    btn.disabled = false;
    btn.textContent = "📢 Send to All Students";
  }

  if (!result.success) {
    alert(result.message || "Failed to send notification.");
    return;
  }

  textarea.value = "";

  await loadNotifications();
}

async function loadNotifications() {
  const container = currentContainer;

  const list = container.querySelector("#notificationsList");
  if (!list) return;

  const notifications = await getRecentNotifications();

  // Bail if the admin navigated away from Notifications while this
  // fetch was in flight — same race subjects.js guards against in
  // loadSubjects().
  if (currentContainer !== container || !container.isConnected) return;

  if (notifications.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        No notifications sent yet.
      </div>
    `;
    return;
  }

  list.innerHTML = notifications
    .map(
      (n) => `
        <div class="notification-row">

          <div class="notification-row-main">
            <p class="notification-row-message">${escapeHtml(n.message)}</p>
            <div class="notification-row-meta">
              <span>${escapeHtml(n.createdBy || "Admin")}</span>
              <span>•</span>
              <span>${formatNotificationTime(n.createdAt)}</span>
            </div>
          </div>

          <button class="delete-notification" data-id="${n.id}">
            Delete
          </button>

        </div>
      `,
    )
    .join("");

  list.querySelectorAll(".delete-notification").forEach((btn) => {
    btn.addEventListener("click", handleDelete);
  });
}

async function handleDelete(e) {
  const id = e.currentTarget.dataset.id;
  if (!id) return;

  const confirmed = confirm(
    "Delete this notification? Students who haven't opened the bell yet won't see it.",
  );

  if (!confirmed) return;

  const container = currentContainer;

  await deleteNotification(id);

  if (currentContainer !== container || !container.isConnected) return;

  await loadNotifications();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
