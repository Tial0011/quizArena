import {
  shouldShowNudge,
  snoozeNudge,
  triggerInstallPrompt,
  onInstallabilityChange,
} from "../installPrompt.js";

let mounted = false;

/**
 * Floating, dismissible "Install Quiz Arena" pill.
 *
 * Appended once to <body> (a sibling of #app, not inside it), so
 * it survives every SPA page swap instead of getting wiped out by
 * the next `app.innerHTML = ...`. That's what makes this a
 * recurring nudge rather than the old landing-page-only button:
 * it re-evaluates whether to show itself on every mount call and
 * every install-availability change, snoozing (not permanently
 * hiding) on dismissal -- see installPrompt.js.
 */
export function initInstallNudge() {
  if (mounted) return;
  mounted = true;

  maybeShow();
  onInstallabilityChange(maybeShow);
}

function maybeShow() {
  if (document.getElementById("installNudge")) return;
  if (!shouldShowNudge()) return;

  const el = document.createElement("div");
  el.id = "installNudge";
  el.className = "install-nudge";
  el.innerHTML = `
    <span class="install-nudge-icon">📲</span>
    <div class="install-nudge-text">
      <strong>Install Quiz Arena</strong>
      <span>Add it to your home screen for quick access</span>
    </div>
    <button type="button" class="install-nudge-btn" id="installNudgeBtn">Install</button>
    <button type="button" class="install-nudge-close" id="installNudgeClose" aria-label="Dismiss">&times;</button>
  `;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add("install-nudge-show"));

  document
    .getElementById("installNudgeBtn")
    .addEventListener("click", async () => {
      const { outcome } = await triggerInstallPrompt();
      // "accepted" -> job done, no need to nag again.
      // "dismissed" -> treat exactly like the close button (snooze).
      // "unavailable" -> shouldn't normally happen since the nudge
      // only shows when canInstall() was true, but harmless either way.
      if (outcome !== "unavailable") {
        dismiss();
      }
    });

  document
    .getElementById("installNudgeClose")
    .addEventListener("click", dismiss);
}

function dismiss() {
  snoozeNudge();
  const el = document.getElementById("installNudge");
  if (!el) return;
  el.classList.remove("install-nudge-show");
  setTimeout(() => el.remove(), 250);
}
