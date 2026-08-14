import { auth } from "./firebase/config.js";
import { resendVerificationEmail, logoutUser } from "./auth.js";

const app = document.getElementById("app");

let cooldownUntil = 0;

/**
 * Full-page "verify your email" gate — shown instead of the
 * dashboard whenever `auth.currentUser.emailVerified` is false.
 * Used from both js/main.js (page reload / returning session) and
 * js/ui/landing.js (fresh signup/login), so this lives in one shared
 * place rather than being duplicated in both.
 *
 * `onVerified` is called once the student has actually confirmed the
 * link (we re-check via user.reload(), never trust a stale local
 * flag).
 */
export function renderVerificationGate(user, onVerified) {
  app.innerHTML = `
    <div class="verify-gate">
      <div class="verify-gate-card">
        <div class="verify-gate-icon">📩</div>
        <h2>Verify your email</h2>
        <p class="verify-gate-email">${user.email}</p>
        <p class="verify-gate-text">
          We sent a verification link to the address above. Click it,
          then come back here and tap "I've verified — Continue".
        </p>
        <p class="verify-gate-spam-note">
          ⚠️ <strong>The email almost always lands in Spam/Junk</strong>
          — please check there (and "Promotions" on Gmail) before
          requesting a resend.
        </p>

        <button type="button" id="verifyContinueBtn" class="submit-btn">
          I've verified — Continue
        </button>

        <button type="button" id="verifyResendBtn" class="verify-gate-resend">
          Resend verification email
        </button>

        <button type="button" id="verifySignOutBtn" class="verify-gate-signout">
          Sign out / use a different account
        </button>
      </div>
    </div>
  `;

  document
    .getElementById("verifyContinueBtn")
    .addEventListener("click", () => handleContinue(onVerified));

  document
    .getElementById("verifyResendBtn")
    .addEventListener("click", handleResend);

  document
    .getElementById("verifySignOutBtn")
    .addEventListener("click", async () => {
      await logoutUser();
    });
}

async function handleContinue(onVerified) {
  const btn = document.getElementById("verifyContinueBtn");
  btn.disabled = true;
  btn.textContent = "Checking...";

  // Firebase caches emailVerified on the local user object — reload()
  // re-fetches it from the server, since that's the only way to know
  // whether the link was actually clicked yet.
  await auth.currentUser.reload();

  if (auth.currentUser.emailVerified) {
    onVerified();
    return;
  }

  btn.disabled = false;
  btn.textContent = "I've verified — Continue";
  alert(
    "Still not verified yet. Please open the link in the email first (check Spam/Junk), then try again.",
  );
}

async function handleResend() {
  const btn = document.getElementById("verifyResendBtn");

  if (Date.now() < cooldownUntil) {
    const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
    alert(`Please wait ${secondsLeft}s before requesting another email.`);
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending...";

  const result = await resendVerificationEmail(auth.currentUser);
  alert(result.message);

  // 60s cooldown regardless of outcome — Firebase itself rate-limits
  // this endpoint, so spamming the button just earns a
  // "too-many-requests" error rather than more emails.
  cooldownUntil = Date.now() + 60000;
  btn.disabled = false;
  btn.textContent = "Resend verification email";
}
