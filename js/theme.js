/* =========================================================
   THEME (light / dark)
   - First paint is handled by the inline script in index.html
     (so there is no white flash before this module loads).
   - Choice is saved in localStorage ("qa-theme"); with no saved
     choice the phone/laptop setting decides, and follows it live.
   - Any element with [data-theme-toggle] is a toggle button.
========================================================= */
const KEY = "qa-theme";
const META = { light: "#f2faf9", dark: "#061616" };

const SUN =
  '<svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
const MOON =
  '<svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>';

export const themeIcons = SUN + MOON;

export function themeToggleButton(extraClass = "") {
  return `<button type="button" class="theme-toggle ${extraClass}" data-theme-toggle aria-label="Switch to dark mode" title="Switch theme">${themeIcons}</button>`;
}

function saved() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}
const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || (systemDark() ? "dark" : "light");
}

function apply(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", META[theme]));
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    const next = theme === "dark" ? "light" : "dark";
    b.setAttribute("aria-label", `Switch to ${next} mode`);
    b.setAttribute("aria-pressed", String(theme === "dark"));
  });
}

export function setTheme(theme, { persist = true, animate = true } = {}) {
  const root = document.documentElement;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduce) {
    root.classList.add("theme-anim");
    setTimeout(() => root.classList.remove("theme-anim"), 350);
  }
  apply(theme);
  if (persist) {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: still works for this visit */
    }
  }
}

export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

let started = false;
export function initTheme() {
  if (started) return;
  started = true;

  apply(saved() || (systemDark() ? "dark" : "light"));

  document.addEventListener("click", (e) => {
    if (e.target.closest?.("[data-theme-toggle]")) toggleTheme();
  });

  // Follow the OS live, but only until the user picks for themselves.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
    if (!saved()) setTheme(e.matches ? "dark" : "light", { persist: false });
  });

  // Floating toggle for pages with no toggle in their own header.
  if (!document.querySelector(".theme-fab")) {
    const wrap = document.createElement("div");
    wrap.className = "theme-fab";
    wrap.innerHTML = themeToggleButton();
    document.body.appendChild(wrap);
    apply(currentTheme());
  }
}
