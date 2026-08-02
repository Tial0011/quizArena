const CACHE_NAME = "quizarena-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Pass-through for now — no offline caching yet.
  // This handler just needs to exist for installability.
  e.respondWith(fetch(e.request));
});
