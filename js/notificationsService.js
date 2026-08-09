import { db } from "./firebase/config.js";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  arrayUnion,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   NOTIFICATIONS SERVICE

   Sole reader/writer for the "notifications" collection — same
   pattern as attemptsService.js for "attempts".

   Two kinds of notification, told apart by `targetUserId`:
   - Broadcasts: targetUserId is the literal string "all". Sent
     from the admin Notifications tab, or automatically (e.g. "new
     quiz added"). Visible to every student.
   - Personal pings: targetUserId is a specific user's uid (e.g.
     the one-time "welcome" message on signup). Visible only to
     that student. These are deliberately kept OUT of the admin
     "Sent Notifications" list — that list is a broadcast log, not
     a firehose of every individual welcome ping.

   "all" is used instead of null/undefined as the broadcast marker
   so both cases can be queried with a single `where(...,"in",...)`
   — Firestore's `in` operator over a plain array of strings is
   simple and well-supported, whereas mixing null into an `in`
   array is not something to rely on.

   "Read" state is deliberately NOT tracked per-notification (that
   would mean a readBy array growing on every doc forever) —
   instead each user doc gets a single `lastNotificationsSeenAt`
   timestamp, stamped when they open the bell panel. A notification
   counts as unread if it was created after that timestamp.

   "Dismissed" state works the same way, but per-notification: each
   user doc also gets a `dismissedNotificationIds` array. Dismissing
   is personal (hides it from just that student's bell, doesn't
   touch the notification doc itself) — see dismissNotificationForUser().

   Each notification document:
   {
     message, createdBy, targetUserId, createdAt
   }
========================================================= */

const FETCH_LIMIT = 20;
const BROADCAST_TARGET = "all";

/**
 * Sends a notification. `targetUserId` defaults to a broadcast —
 * pass a specific uid to make it a personal ping instead (see
 * sendWelcomeNotification below).
 */
export async function sendNotification({
  message,
  createdBy = "Admin",
  targetUserId = BROADCAST_TARGET,
}) {
  const trimmed = (message || "").trim();

  if (!trimmed) {
    return { success: false, message: "Enter a message first." };
  }

  try {
    await addDoc(collection(db, "notifications"), {
      message: trimmed,
      createdBy,
      targetUserId,
      createdAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    console.error("Failed to send notification:", err);
    return { success: false, message: err.message };
  }
}

/**
 * Fetches the most recent BROADCAST notifications, newest first.
 * This is the admin "Sent Notifications" view — personal pings
 * (welcomes, etc.) are excluded so it stays a clean broadcast log.
 *
 * NOTE: filters on `targetUserId` and orders by `createdAt` —
 * Firestore will want a composite index for that combination, same
 * as the other queries in this project (getRecentAttempts, etc.).
 * The first run will throw an error with a console link to create
 * it in one click.
 */
export async function getRecentNotifications(count = FETCH_LIMIT) {
  const q = query(
    collection(db, "notifications"),
    where("targetUserId", "==", BROADCAST_TARGET),
    orderBy("createdAt", "desc"),
    limit(count),
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (err) {
    console.error("Failed to load notifications:", err);
    return [];
  }
}

/**
 * Fetches a student's notification feed: every broadcast sent since
 * their account existed, plus any personal pings sent just to them
 * (which are always after signup anyway — e.g. the welcome message).
 * This is what the bell panel shows.
 *
 * `accountCreatedAt` is the student's own `createdAt` off their user
 * doc — without it, a brand-new signup would see every broadcast
 * ever sent, including ones from months before they existed. If it's
 * missing for some reason, this falls back to showing everything
 * rather than silently returning nothing.
 *
 * NOTE: combines an "in" filter (targetUserId) with a range filter
 * (createdAt >) ordered on that same range field — valid, but
 * Firestore will still want a composite index for it, same one-click
 * deal as the other queries in this project.
 */
export async function getRecentNotificationsForUser(
  userId,
  accountCreatedAt = null,
  count = FETCH_LIMIT,
) {
  if (!userId) return [];

  const filters = [where("targetUserId", "in", [BROADCAST_TARGET, userId])];

  if (accountCreatedAt) {
    filters.push(where("createdAt", ">", accountCreatedAt));
  }

  const q = query(
    collection(db, "notifications"),
    ...filters,
    orderBy("createdAt", "desc"),
    limit(count),
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (err) {
    console.error("Failed to load notifications:", err);
    return [];
  }
}

/**
 * Deletes a notification. Admin-only.
 */
export async function deleteNotification(id) {
  try {
    await deleteDoc(doc(db, "notifications", id));
    return { success: true };
  } catch (err) {
    console.error("Failed to delete notification:", err);
    return { success: false, message: err.message };
  }
}

/**
 * Marks all current notifications as seen for this student, by
 * stamping `lastNotificationsSeenAt` on their user doc. Doesn't
 * throw — same "supplementary, never block the UI" rule
 * recordQuizAttempt() follows in attemptsService.js.
 */
export async function markNotificationsSeen(userId) {
  if (!userId) return;

  try {
    await updateDoc(doc(db, "users", userId), {
      lastNotificationsSeenAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to mark notifications seen:", err);
  }
}

/**
 * Hides a notification from ONE student's bell — a personal
 * "dismiss", not a delete. The notification document itself is
 * untouched (other students, or the admin's sent-list, are
 * unaffected); this just appends the id to that student's own
 * `dismissedNotificationIds` array, which getRecentNotificationsForUser()
 * callers filter against client-side. Doesn't throw, same
 * "supplementary" rule as the rest of this file — a failed dismiss
 * write just means it may reappear next load, not a broken UI.
 */
export async function dismissNotificationForUser(userId, notificationId) {
  if (!userId || !notificationId) return;

  try {
    await updateDoc(doc(db, "users", userId), {
      dismissedNotificationIds: arrayUnion(notificationId),
    });
  } catch (err) {
    console.error("Failed to dismiss notification:", err);
  }
}

/**
 * Counts how many of the given notifications were created after
 * lastSeenAt. lastSeenAt is the raw Firestore Timestamp stored on
 * the user doc (or undefined/null for a user who has never opened
 * the bell — everything currently visible counts as unread in
 * that case, which just means their first open clears it).
 */
export function countUnread(notifications, lastSeenAt) {
  const lastSeenMs = lastSeenAt?.toMillis ? lastSeenAt.toMillis() : 0;

  return notifications.filter((n) => {
    const createdMs = n.createdAt?.toMillis ? n.createdAt.toMillis() : 0;
    return createdMs > lastSeenMs;
  }).length;
}

/**
 * Relative-time formatter for notification timestamps. Same
 * "just now / Xm ago / Xh ago / Xd ago / date" ladder as
 * formatRelativeTime() in admin.js's activity feed, duplicated
 * here (not imported) so this service has no dependency on
 * admin-only code — the student dashboard imports this file too.
 */
export function formatNotificationTime(timestamp) {
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

/* =========================================================
   AUTOMATIC NOTIFICATIONS

   Thin convenience wrappers around sendNotification() for the two
   automatic triggers requested: a broadcast when a new quiz goes
   up, and a one-time personal welcome when a new user account is
   created. Both are fire-and-forget from the caller's side — an
   automatic notification failing to send should never block a
   quiz save or a signup.
========================================================= */

/**
 * Call this right after a quiz is successfully created (in
 * quizzes.js's addQuiz-equivalent handler) to broadcast it to
 * every student.
 */
export function sendNewQuizNotification(quizTitle) {
  return sendNotification({
    message: `📝 New quiz added: ${quizTitle}`,
    createdBy: "System",
  });
}

/**
 * Call this right after a new user doc is created (registerUser,
 * loginUser, and signInWithGoogle in auth.js all have a "first
 * time we've seen this uid" branch — this belongs in each of
 * those). Personal ping, not a broadcast, so existing students
 * never see other people's welcome messages.
 */
export function sendWelcomeNotification(userId, name) {
  const greeting = name
    ? `Welcome to Quiz Arena, ${name}! 🎉`
    : "Welcome to Quiz Arena! 🎉";

  return sendNotification({
    message: `${greeting} Head to the Marketplace to grab your first quiz.`,
    createdBy: "System",
    targetUserId: userId,
  });
}
