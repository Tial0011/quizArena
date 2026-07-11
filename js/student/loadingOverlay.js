/* =========================================================
   LOADING OVERLAY (shared)

   A full-container loading screen with a spinner and rotating
   status messages. Rotating between a few honest, specific
   messages (rather than one static "Loading...") is a known
   perceived-performance technique — it reads as active work
   happening rather than the app being frozen, which makes the
   same wait feel shorter.

   Usage:
     const stop = showLoadingOverlay(container, [
       "Fetching your questions...",
       "Shuffling things up...",
       "Almost ready...",
     ]);
     await someAsyncWork();
     stop(); // safe to call even if the container was already replaced

   Any module needing a loading state (Practice Arena, My
   Quizzes, etc.) can reuse this rather than building its own.
========================================================= */

export function showLoadingOverlay(container, messages, options = {}) {
  if (!container || !messages || messages.length === 0) {
    return () => {};
  }

  const { subtitle = "" } = options;

  container.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner-wrap">
        <div class="loading-spinner"></div>
        <div class="loading-spinner-shadow"></div>
      </div>
      <p class="loading-message">${messages[0]}</p>
      ${subtitle ? `<p class="loading-subtitle">${subtitle}</p>` : ""}
    </div>
  `;

  let index = 0;

  const intervalId = setInterval(() => {
    index = (index + 1) % messages.length;

    const messageEl = container.querySelector(".loading-message");

    // If the container's contents were already replaced by the
    // time this fires, there's nothing left to update — stop
    // rotating instead of writing into a detached/gone element.
    if (!messageEl) {
      clearInterval(intervalId);
      return;
    }

    messageEl.textContent = messages[index];
  }, 1100);

  // Returns a stop function the caller should invoke once the
  // real content is ready to replace the overlay.
  return () => clearInterval(intervalId);
}
