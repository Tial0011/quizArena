/* =========================================================
   FIREBASE MESSAGING SERVICE WORKER

   Must be deployed at the site ROOT (same level as index.html) —
   a service worker's scope is limited to its own folder and
   everything below it, and this one needs to catch push events
   regardless of which page the student is on.

   This only handles BACKGROUND messages (student's tab isn't open
   or isn't focused). Foreground messages are handled separately by
   the onMessage() listener in pushNotifications.js.

   Uses the *-compat scripts (not the modular SDK) because service
   workers load scripts via importScripts(), not ES module imports —
   same reason firebase/config.js can't be reused here directly. The
   config values below are the same public client config as
   firebase/config.js (safe to duplicate — these values are meant to
   be public, same as any other client-side Firebase config).
========================================================= */

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyBzKtJ5P_2bL0LWDOJt4KqMlA1Z8sMOSwo",
  authDomain: "quizarena-2c75e.firebaseapp.com",
  projectId: "quizarena-2c75e",
  storageBucket: "quizarena-2c75e.appspot.com",
  messagingSenderId: "610430960552",
  appId: "1:610430960552:web:23f5ca5be24bf2e2b4139d",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};

  self.registration.showNotification(title || "Quiz Arena", {
    body: body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  });
});

// Clicking the OS notification focuses an existing Quiz Arena tab
// if one's already open, otherwise opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow("/");
      }),
  );
});
