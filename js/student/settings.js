import { auth, db } from "../firebase/config.js";
import {
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { logoutUser, resetPassword } from "../auth.js";
import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";
import { getThemeChoice, setThemeChoice } from "../theme.js";
import {
  isDesktopModeOn,
  setDesktopMode,
  desktopModeUseful,
} from "../utils/desktopMode.js";
import { requestPushPermission } from "../pushNotifications.js";
import {
  canInstall,
  isInstalled,
  isStandalone,
  triggerInstallPrompt,
  onInstallabilityChange,
} from "../installPrompt.js";
import { showToast } from "../ui/toast.js";

/* =========================================================
   SETTINGS (student)

   Profile (name), appearance, desktop mode, notifications, app
   install, and account actions. Preferences that belong to a
   device (theme, desktop mode) are saved on the device; the name
   is saved to the student's user document.
========================================================= */

const NAME_MIN = 2;
const NAME_MAX = 40;

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function signInMethods() {
  const ids = (auth.currentUser?.providerData || []).map((p) => p.providerId);
  return {
    password: ids.includes("password"),
    google: ids.includes("google.com"),
  };
}

function pushState() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export function renderSettings(userData = {}) {
  history.pushState({ page: "settings" }, "", "");
  registerBackHandler(() => renderStudentDashboard(userData));

  const app = document.getElementById("app");
  const methods = signInMethods();
  const email = userData.email || auth.currentUser?.email || "";
  const name = (userData.name || "").trim();
  const initial = (name || email || "S").charAt(0).toUpperCase();
  const theme = getThemeChoice();
  const desktopOn = isDesktopModeOn();

  const methodText = [methods.google && "Google", methods.password && "Email & password"]
    .filter(Boolean)
    .join(" · ") || "Email";

  app.innerHTML = `
    <div class="st">
      <div class="st-wrap">

        <header class="st-head">
          <button type="button" class="st-back" id="stBack" aria-label="Back to home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <p class="st-eyebrow">Your account</p>
            <h1>Settings</h1>
          </div>
        </header>

        <!-- PROFILE -->
        <section class="st-card" aria-labelledby="stProfileH">
          <h2 id="stProfileH" class="st-h2">Profile</h2>

          <div class="st-profile">
            <span class="st-avatar" id="stAvatar">${esc(initial)}</span>
            <div class="st-profile-meta">
              <strong id="stNameShown">${esc(name || "Student")}</strong>
              <span>${esc(email)}</span>
            </div>
          </div>

          <label class="st-label" for="stName">Display name</label>
          <div class="st-row">
            <input id="stName" class="st-input" type="text" maxlength="${NAME_MAX}"
                   autocomplete="name" value="${esc(name)}" placeholder="Your name" />
            <button type="button" class="st-btn" id="stSaveName" disabled>Save</button>
          </div>
          <p class="st-hint" id="stNameHint">This is the name friends see in groups and leaderboards.</p>

          <div class="st-kv"><span>Email</span><strong>${esc(email) || "—"}</strong></div>
          <div class="st-kv"><span>Signed in with</span><strong>${esc(methodText)}</strong></div>
        </section>

        <!-- APPEARANCE -->
        <section class="st-card" aria-labelledby="stThemeH">
          <h2 id="stThemeH" class="st-h2">Appearance</h2>
          <div class="st-seg" role="radiogroup" aria-label="Theme" id="stTheme">
            ${[
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "System"],
            ]
              .map(
                ([v, l]) =>
                  `<button type="button" role="radio" class="st-seg-btn${theme === v ? " is-on" : ""}" data-theme-choice="${v}" aria-checked="${theme === v}">${l}</button>`,
              )
              .join("")}
          </div>
          <p class="st-hint">System follows your phone's light/dark setting.</p>
        </section>

        <!-- DISPLAY -->
        <section class="st-card" aria-labelledby="stDisplayH">
          <h2 id="stDisplayH" class="st-h2">Display</h2>

          <div class="st-toggle-row">
            <div>
              <strong>Desktop mode</strong>
              <p class="st-hint st-hint-tight">Shows the full desktop layout on your phone, like "Desktop site" in your browser menu.</p>
            </div>
            <button type="button" class="st-switch${desktopOn ? " is-on" : ""}" id="stDesktop"
                    role="switch" aria-checked="${desktopOn}" aria-label="Desktop mode">
              <i></i>
            </button>
          </div>
          <p class="st-hint" id="stDesktopHint">${
            desktopModeUseful()
              ? "Everything gets smaller; pinch to zoom in. Turn it off any time to go back to the phone layout."
              : "You're already on a wide screen, so this changes little here. It's meant for phones and tablets."
          }</p>
        </section>

        <!-- NOTIFICATIONS -->
        <section class="st-card" aria-labelledby="stNotifH">
          <h2 id="stNotifH" class="st-h2">Notifications</h2>
          <div class="st-toggle-row">
            <div>
              <strong>Push notifications</strong>
              <p class="st-hint st-hint-tight" id="stPushText"></p>
            </div>
            <button type="button" class="st-btn st-btn-ghost" id="stPushBtn" hidden>Turn on</button>
          </div>
        </section>

        <!-- APP -->
        <section class="st-card" id="stAppCard" aria-labelledby="stAppH">
          <h2 id="stAppH" class="st-h2">App</h2>
          <div class="st-toggle-row">
            <div>
              <strong>Quiz Arena on your home screen</strong>
              <p class="st-hint st-hint-tight" id="stAppText"></p>
            </div>
            <button type="button" class="st-btn st-btn-ghost" id="stInstallBtn" hidden>Install</button>
          </div>
        </section>

        <!-- ACCOUNT -->
        <section class="st-card" aria-labelledby="stAccH">
          <h2 id="stAccH" class="st-h2">Account</h2>
          ${
            methods.password
              ? `<div class="st-toggle-row">
                  <div>
                    <strong>Password</strong>
                    <p class="st-hint st-hint-tight">We'll email a link to ${esc(email)} so you can choose a new one.</p>
                  </div>
                  <button type="button" class="st-btn st-btn-ghost" id="stReset">Send link</button>
                </div>`
              : `<p class="st-hint">You sign in with Google, so there's no password to change here.</p>`
          }
          <button type="button" class="st-btn st-btn-danger st-block" id="stLogout">Sign out</button>
        </section>

      </div>
    </div>
  `;

  window.scrollTo({ top: 0 });
  wire(userData, email);
}

function wire(userData, email) {
  const $ = (id) => document.getElementById(id);

  $("stBack").addEventListener("click", () => renderStudentDashboard(userData));

  /* ----- name ----- */
  const nameInput = $("stName");
  const saveBtn = $("stSaveName");
  const hint = $("stNameHint");
  const original = () => (userData.name || "").trim();

  const check = () => {
    const v = nameInput.value.trim().replace(/\s+/g, " ");
    saveBtn.disabled = !v || v === original();
  };
  nameInput.addEventListener("input", () => {
    hint.classList.remove("is-error");
    check();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !saveBtn.disabled) saveBtn.click();
  });

  saveBtn.addEventListener("click", async () => {
    const v = nameInput.value.trim().replace(/\s+/g, " ");

    if (v.length < NAME_MIN || v.length > NAME_MAX) {
      hint.textContent = `Name must be ${NAME_MIN}–${NAME_MAX} characters.`;
      hint.classList.add("is-error");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    try {
      await updateDoc(doc(db, "users", userData.id), { name: v });
      // Keep the sign-in profile in step; not critical if it fails.
      if (auth.currentUser) {
        updateProfile(auth.currentUser, { displayName: v }).catch(() => {});
      }

      userData.name = v; // the dashboard re-renders from this same object
      nameInput.value = v;
      $("stNameShown").textContent = v;
      $("stAvatar").textContent = v.charAt(0).toUpperCase();
      hint.textContent = "Name updated.";
      hint.classList.remove("is-error");
      showToast("Name updated");
    } catch (err) {
      console.error("Failed to update name:", err);
      hint.textContent = "Couldn't save your name. Check your connection and try again.";
      hint.classList.add("is-error");
    } finally {
      saveBtn.textContent = "Save";
      check();
    }
  });

  /* ----- theme ----- */
  $("stTheme").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-choice]");
    if (!btn) return;
    setThemeChoice(btn.dataset.themeChoice);
    $("stTheme")
      .querySelectorAll(".st-seg-btn")
      .forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      });
  });

  /* ----- desktop mode ----- */
  const sw = $("stDesktop");
  sw.addEventListener("click", () => {
    const on = !sw.classList.contains("is-on");
    sw.classList.toggle("is-on", on);
    sw.setAttribute("aria-checked", String(on));
    setDesktopMode(on);
    showToast(on ? "Desktop mode on. Pinch to zoom." : "Desktop mode off");
  });

  /* ----- push ----- */
  const pushText = $("stPushText");
  const pushBtn = $("stPushBtn");
  const paintPush = () => {
    const state = pushState();
    pushBtn.hidden = true;

    if (state === "granted") {
      pushText.textContent = "On. You'll get streak reminders and updates on this device.";
    } else if (state === "default") {
      pushText.textContent = "Off. Turn on to get streak reminders and updates.";
      pushBtn.hidden = false;
    } else if (state === "denied") {
      pushText.textContent =
        "Blocked in your browser. Open your browser's site settings for Quiz Arena and allow notifications.";
    } else {
      pushText.textContent = "Not supported in this browser.";
    }
  };
  paintPush();

  pushBtn.addEventListener("click", async () => {
    pushBtn.disabled = true;
    await requestPushPermission(userData.id);
    pushBtn.disabled = false;
    paintPush();
  });

  /* ----- install ----- */
  const appText = $("stAppText");
  const installBtn = $("stInstallBtn");
  const paintApp = () => {
    installBtn.hidden = true;

    if (isStandalone()) {
      appText.textContent = "You're using the installed app.";
    } else if (canInstall()) {
      appText.textContent = "Install it for instant opening, even on bad network.";
      installBtn.hidden = false;
    } else if (isInstalled()) {
      appText.textContent = "Already installed. Open it from your home screen.";
    } else {
      appText.textContent =
        "To install, open your browser menu and tap Install app or Add to Home screen.";
    }
  };
  paintApp();
  const off = onInstallabilityChange(() => {
    if (!document.getElementById("stInstallBtn")) return off();
    paintApp();
  });

  installBtn.addEventListener("click", async () => {
    installBtn.disabled = true;
    await triggerInstallPrompt();
    installBtn.disabled = false;
    paintApp();
  });

  /* ----- account ----- */
  $("stReset")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Sending…";
    const result = await resetPassword(email);
    showToast(result.message || (result.success ? "Check your email for the reset link." : "Couldn't send the email."));
    btn.textContent = result.success ? "Sent" : "Send link";
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Send link";
    }, 30000); // avoid hammering Firebase's email limit
  });

  $("stLogout").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to logout?")) return;
    await logoutUser();
  });
}
