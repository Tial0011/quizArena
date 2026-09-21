/* =========================================================
   WELCOME GATE

   First screen for a new visitor, BEFORE the sign-in page:

     welcome    big typed greeting
     download   "First, download Quiz Arena"  + Download button
     installing loading line while the phone installs the app
     installed  "It's on your phone -- check your home screen"
     ...then main.js renders the normal landing / sign-in page.

   What the browser lets us know (and what it doesn't)
   - Android Chrome / Edge / Samsung / desktop Chromium: we can open the
     install dialog from a tap, learn whether they accepted, and get a
     real "appinstalled" event when it finishes. The loading line is an
     honest estimate that completes when that event arrives -- browsers
     don't expose byte-level progress for the OS install itself.
   - iOS Safari and browsers without an install API: no event at all.
     They get step-by-step "Add to Home Screen" instructions and a
     button to confirm.

   The gate never traps anyone: "Continue in browser" is always there,
   and dismissing it hides the gate for a few days (same snooze idea as
   the dashboard install nudge). The gate is also skipped when the app
   is already running installed, or for anyone who has signed in before.

   For testing: open the site with ?welcome=1 to force the gate to show.
========================================================= */

import {
  canInstall,
  isIOS,
  isInstalled,
  isStandalone,
  isInstalledElsewhere,
  onAppInstalled,
  onInstallabilityChange,
  triggerInstallPrompt,
} from "../installPrompt.js";
import { watchPrecache } from "../pwa.js";

const GATE_KEY = "qa_gate";
const RETURNING_KEY = "qa_returning";
const SKIP_DAYS = 3;

const INSTALL_ESTIMATE_MS = 40000; // what we tell students to expect
const INSTALL_GIVE_UP_MS = 90000; // then offer a manual "I can see it" button
const PROMPT_WAIT_MS = 2500; // how long to wait for the browser to offer the install dialog

const reduceMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/* ---------------------------------------------------------
   Small persisted state
--------------------------------------------------------- */
function readGate() {
  try {
    return JSON.parse(localStorage.getItem(GATE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeGate(patch) {
  try {
    localStorage.setItem(GATE_KEY, JSON.stringify({ ...readGate(), ...patch }));
  } catch {
    /* private mode: the gate just shows again next visit */
  }
}

/**
 * Called once someone has signed in on this device, so they never see the
 * gate again -- even after they sign out or the 1-hour inactivity logout.
 */
export function markReturningUser() {
  try {
    localStorage.setItem(RETURNING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldShowGate() {
  const params = new URLSearchParams(location.search);
  if (params.get("welcome") === "0") return false;
  if (params.get("welcome") === "1") return true; // testing override

  if (isStandalone() || isInstalled()) return false;

  try {
    if (localStorage.getItem(RETURNING_KEY) === "1") return false;
  } catch {
    /* ignore */
  }

  const { skippedAt, installedAt } = readGate();
  if (installedAt) return false;
  if (skippedAt && Date.now() - skippedAt < SKIP_DAYS * 86400000) return false;
  return true;
}

/* ---------------------------------------------------------
   Copy for each stage
--------------------------------------------------------- */
const SHARE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const STAGES = {
  welcome: {
    h1: "We're so glad you're here.",
    sub: "The smarter, science-backed way to study.",
    typeSub: true,
  },
  download: {
    h1: "First, download Quiz Arena.",
    sub: "It takes about 40 seconds. After that it lives on your phone and opens even when your network is bad.",
    cta: "Download app",
    skip: true,
  },
  waiting: {
    h1: "First, download Quiz Arena.",
    sub: "Getting the download ready…",
    cta: "Download app",
    ctaDisabled: true,
    skip: true,
  },
  confirming: {
    h1: "First, download Quiz Arena.",
    sub: "Confirm on your screen when your phone asks.",
    cta: "Waiting for you…",
    ctaDisabled: true,
  },
  installing: {
    h1: "Downloading to your phone.",
    sub: "Please wait about 40 seconds, then check your phone.",
    progress: true,
  },
  installed: {
    h1: "It's on your phone.",
    sub: "Check your home screen or your app drawer for Quiz Arena. You can open it from there any time.",
    cta: "Continue to sign in",
  },
  manualIOS: {
    h1: "Add it to your home screen.",
    steps: [
      `Tap the Share button ${SHARE_ICON} at the bottom of Safari.`,
      "Scroll down and tap Add to Home Screen.",
      "Tap Add. Quiz Arena appears on your home screen.",
    ],
    cta: "I've added it",
    skip: true,
  },
  manualOther: {
    h1: "One more tap to download.",
    sub: "Open your browser menu (the three dots at the top), then tap Install app or Add to Home screen.",
    cta: "I've added it",
    skip: true,
  },
  declined: {
    h1: "No problem.",
    sub: "You can download it whenever you're ready. Signing in works either way.",
    cta: "Continue to sign in",
  },
};

/* ---------------------------------------------------------
   Gate lifecycle (module singleton)
--------------------------------------------------------- */
let root = null;
let donePromise = null;
let resolveDone = null;

/** Resolves when the gate is finished (immediately if it never opened). */
export function whenGateDone() {
  return donePromise || Promise.resolve();
}

export function isGateOpen() {
  return !!root;
}

/** Mounts the gate if it's needed. Safe to call more than once. */
export function mountWelcomeGateIfNeeded() {
  if (root) return whenGateDone();
  if (!shouldShowGate()) return Promise.resolve();

  donePromise = new Promise((resolve) => (resolveDone = resolve));
  build();
  return donePromise;
}

/** Closes the gate (used when auth turns out to have a signed-in user). */
export function closeWelcomeGate({ instant = false } = {}) {
  if (!root) return;
  teardown(instant);
}

/* ---------------------------------------------------------
   Build
--------------------------------------------------------- */
let cleanup = [];
let runId = 0; // cancels a stage's typing when the stage changes
let stage = null;
let typingDone = true;
let skipTyping = false;
let advanceTimer = null;
let promptTimer = null;
let installStartedAt = 0;
let progressRaf = 0;
let progressValue = 0;
let precache = { done: 0, total: 0, failed: 0, ready: false };
let cube = null;
let installedNow = false; // set synchronously so racing events can't double-handle
let currentH1 = null;

function build() {
  root = document.createElement("div");
  root.id = "welcomeGate";
  root.className = "wg";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Welcome to Quiz Arena");
  root.tabIndex = -1;
  root.dataset.stage = "welcome";
  installedNow = false;
  currentH1 = null;

  root.innerHTML = `
    <header class="wg-brand">
      <img src="/icons/icon-192.png" width="30" height="30" alt="" />
      <span>Quiz Arena</span>
    </header>

    <main class="wg-copy" id="wgCopy">
      <h1 class="wg-h1" id="wgH1"></h1>
      <p class="wg-sub" id="wgSub"></p>
    </main>

    <div class="wg-scene" aria-hidden="true">
      <div class="wg-floor"><div class="wg-grid"></div></div>
      <div class="wg-glow"></div>
      <div class="wg-stage3d">
        <div class="wg-cube" id="wgCube">
          <div class="wg-face wg-face--front">A</div>
          <div class="wg-face wg-face--right">B</div>
          <div class="wg-face wg-face--back">C</div>
          <div class="wg-face wg-face--left">D</div>
          <div class="wg-face wg-face--top">${CHECK_ICON}</div>
          <div class="wg-face wg-face--bottom"></div>
        </div>
      </div>
    </div>

    <footer class="wg-actions">
      <div class="wg-progress" id="wgProgress" hidden>
        <div class="wg-track" role="progressbar" aria-label="Installing Quiz Arena"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="wgTrack">
          <i class="wg-fill" id="wgFill"></i>
        </div>
        <p class="wg-status" id="wgStatus" aria-live="polite"></p>
      </div>
      <button type="button" class="wg-btn" id="wgCta" hidden></button>
      <button type="button" class="wg-skip" id="wgSkip" hidden>Continue in browser</button>
    </footer>
  `;

  document.body.appendChild(root);
  document.documentElement.classList.add("wg-lock");

  // If Firebase auth turns out to have a signed-in user, main.js closes us.
  cube = createCube(root.querySelector("#wgCube"));

  on(root.querySelector("#wgCta"), "click", onCta);
  on(root.querySelector("#wgSkip"), "click", () => finish("skipped"));
  on(root, "pointerdown", onTapAnywhere);

  // Live signals from the browser and the service worker.
  cleanup.push(
    onAppInstalled(() => {
      if (["installing", "confirming", "download", "waiting", "manualOther", "declined"].includes(stage)) {
        showInstalled();
      }
    }),
    onInstallabilityChange(onInstallabilityUpdate),
    watchPrecache((p) => {
      precache = p;
      if (stage === "installing") updateStatusText();
    }),
  );

  setStage("welcome");
}

function on(el, type, fn, opts) {
  el.addEventListener(type, fn, opts);
  cleanup.push(() => el.removeEventListener(type, fn, opts));
}

function teardown(instant) {
  const el = root;
  if (!el) return;

  runId++;
  clearTimeout(advanceTimer);
  clearTimeout(promptTimer);
  cancelAnimationFrame(progressRaf);
  cleanup.forEach((fn) => fn());
  cleanup = [];
  cube?.destroy();
  cube = null;
  root = null;
  stage = null;

  document.documentElement.classList.remove("wg-lock");
  const resolve = resolveDone;
  resolveDone = null;
  donePromise = null;

  if (instant || reduceMotion()) {
    el.remove();
  } else {
    el.classList.add("wg-leave");
    setTimeout(() => el.remove(), 460);
  }
  resolve?.();
}

/** End the gate. `how` decides what we remember. */
function finish(how) {
  if (how === "installed") writeGate({ installedAt: Date.now() });
  else writeGate({ skippedAt: Date.now() });
  teardown(false);
}

/* ---------------------------------------------------------
   Stage machine
--------------------------------------------------------- */
const $ = (id) => root && root.querySelector("#" + id);

async function setStage(name) {
  if (!root) return;
  const myRun = ++runId;
  clearTimeout(advanceTimer);

  const def = STAGES[name];
  const copy = $("wgCopy");
  const firstPaint = stage === null;
  // Same headline as the stage we're leaving (download -> confirming, ...):
  // keep it on screen instead of erasing and retyping it.
  const sameHead = !firstPaint && currentH1 === def.h1 && name !== "welcome";

  if (!firstPaint && !sameHead && !reduceMotion()) {
    copy.classList.add("wg-out");
    await wait(230);
    if (myRun !== runId || !root) return;
  }

  stage = name;
  root.dataset.stage = name;
  root.classList.remove("wg-typed");
  if (name === "installing") startProgress();

  // ----- texts
  const h1 = $("wgH1");
  const sub = $("wgSub");
  let chars1 = [];
  if (!sameHead) {
    chars1 = prepareTyping(h1, def.h1);
    currentH1 = def.h1;
  }
  sub.hidden = !(def.sub || def.steps);
  sub.classList.remove("wg-fade-in");
  void sub.offsetWidth; // restart the fade-in animation

  let chars2 = [];
  if (def.steps) {
    sub.innerHTML = `<ol class="wg-steps">${def.steps.map((t) => `<li>${t}</li>`).join("")}</ol>`;
  } else if (def.sub && def.typeSub) {
    chars2 = prepareTyping(sub, def.sub);
  } else if (def.sub) {
    sub.textContent = def.sub;
  }

  // ----- controls
  const cta = $("wgCta");
  const skip = $("wgSkip");
  const progress = $("wgProgress");
  cta.hidden = !def.cta;
  cta.textContent = def.cta || "";
  cta.disabled = !!def.ctaDisabled;
  skip.hidden = !def.skip;
  progress.hidden = !def.progress;

  copy.classList.remove("wg-out");

  // ----- type it
  typingDone = false;
  skipTyping = false;
  const plainSub = !!(def.sub && !def.typeSub) || !!def.steps;

  if (reduceMotion()) {
    chars1.concat(chars2).forEach((c) => c.classList.add("on"));
  } else {
    if (chars1.length) {
      await typeChars(chars1, 44, myRun);
      if (myRun !== runId) return;
    }
    if (chars2.length) {
      await wait(180);
      if (myRun !== runId) return;
      chars1.at(-1)?.classList.remove("cur");
      await typeChars(chars2, 30, myRun);
      if (myRun !== runId) return;
    } else if (plainSub) {
      sub.classList.add("wg-fade-in");
    }
  }

  typingDone = true;
  root.classList.add("wg-typed");
  after(name);

  if (!cta.hidden && !cta.disabled) cta.focus({ preventScroll: true });
  else if (name !== "confirming") root.focus({ preventScroll: true });
}

/** What happens once a stage has finished typing. */
function after(name) {
  if (name === "welcome") {
    // Let it be read, then move on. Tapping anywhere skips the wait.
    advanceTimer = setTimeout(enterDownload, 2300);
  }
  if (name === "installing") {
    updateStatusText();
  }
}

function onTapAnywhere(e) {
  if (!root) return;
  if (e.target.closest("button")) return;

  if (!typingDone) {
    skipTyping = true; // typeChars() notices and reveals everything
    return;
  }
  if (stage === "welcome") {
    clearTimeout(advanceTimer);
    enterDownload();
  }
}

/* ---------------------------------------------------------
   Install flow
--------------------------------------------------------- */
async function enterDownload() {
  if (!root) return;
  clearTimeout(promptTimer);

  // Already on this phone? (Chrome on Android can tell us.)
  if (await isInstalledElsewhere()) {
    showInstalled();
    return;
  }
  if (!root) return;

  if (canInstall()) {
    setStage("download");
  } else if (isIOS()) {
    setStage("manualIOS");
  } else {
    // Chrome usually offers the install dialog a moment after load.
    setStage("waiting");
    promptTimer = setTimeout(() => {
      if (stage === "waiting") setStage("manualOther");
    }, PROMPT_WAIT_MS);
  }
}

/** The browser just (re)offered the install dialog. */
function onInstallabilityUpdate() {
  if (!root) return;
  if (canInstall() && (stage === "waiting" || stage === "manualOther")) {
    clearTimeout(promptTimer);
    setStage("download");
  }
}

async function onCta() {
  if (!root) return;

  switch (stage) {
    case "download": {
      setStage("confirming");
      const { outcome } = await triggerInstallPrompt();
      if (!root) return;
      if (installedNow) return; // appinstalled beat us to it (desktop Chrome installs instantly)
      if (outcome === "accepted") startInstalling();
      else if (outcome === "dismissed") setStage("declined");
      else setStage(isIOS() ? "manualIOS" : "manualOther");
      break;
    }
    case "installing": // the "I can see it" fallback button
      showInstalled();
      break;
    case "installed":
    case "declined":
      finish(stage === "installed" ? "installed" : "skipped");
      break;
    case "manualIOS":
    case "manualOther":
      finish("skipped"); // can't verify; hide the gate for a few days
      break;
    default:
      break;
  }
}

function startInstalling() {
  installStartedAt = performance.now();
  progressValue = 0;
  lastStatus = "";
  setStage("installing"); // starts the loading line once the stage switches
}

async function showInstalled() {
  if (!root || installedNow) return;
  installedNow = true;
  cancelAnimationFrame(progressRaf);
  writeGate({ installedAt: Date.now() });

  // If the loading line is on screen, let it finish before moving on.
  if (stage === "installing") {
    const quick = reduceMotion();
    const fill = $("wgFill");
    if (fill) {
      fill.style.transition = quick ? "none" : "transform 0.5s ease";
      fill.style.setProperty("--p", "1");
    }
    $("wgTrack")?.setAttribute("aria-valuenow", "100");
    const status = $("wgStatus");
    if (status) status.textContent = "Downloaded.";
    await wait(quick ? 0 : 800);
    if (!root) return;
  }

  setStage("installed");
  root.classList.add("wg-done");
  cube?.celebrate();
  try {
    navigator.vibrate?.([30, 50, 30]);
  } catch {
    /* not supported */
  }
}

/* ----- loading line -----
   Estimate: eases toward ~94% over the time we told the student to
   expect (40s) and never reaches 100% by itself -- only the browser's
   "appinstalled" event (or the student) finishes it. */
function startProgress() {
  cancelAnimationFrame(progressRaf);
  const fill = () => $("wgFill");
  const track = () => $("wgTrack");
  let shownGiveUp = false;

  const tick = () => {
    if (!root || stage !== "installing") return;
    const elapsed = performance.now() - installStartedAt;
    const eased = 0.94 * (1 - Math.exp((-3 * elapsed) / INSTALL_ESTIMATE_MS));
    progressValue = Math.max(progressValue, eased);

    const f = fill();
    if (f) f.style.setProperty("--p", progressValue.toFixed(4));
    track()?.setAttribute("aria-valuenow", String(Math.round(progressValue * 100)));

    if (!shownGiveUp && elapsed > INSTALL_GIVE_UP_MS) {
      shownGiveUp = true;
      const cta = $("wgCta");
      cta.hidden = false;
      cta.disabled = false;
      cta.textContent = "I can see it on my phone";
    }
    updateStatusText(elapsed);
    progressRaf = requestAnimationFrame(tick);
  };
  progressRaf = requestAnimationFrame(tick);
}

let lastStatus = "";
function updateStatusText(elapsed = performance.now() - installStartedAt) {
  const el = $("wgStatus");
  if (!el) return;

  let text;
  if (elapsed > INSTALL_ESTIMATE_MS * 1.6) {
    text = "Still working. Slow networks take longer. Check your home screen.";
  } else if (elapsed > INSTALL_ESTIMATE_MS) {
    text = "Almost there. Your phone is finishing the download.";
  } else if (precache.total && !precache.ready && precache.done + precache.failed < precache.total) {
    text = `Saving for offline use: ${precache.done} of ${precache.total} files`;
  } else if (precache.ready) {
    text = "Saved for offline use. Finishing the download…";
  } else {
    text = "Your phone is downloading Quiz Arena…";
  }
  if (text !== lastStatus) {
    lastStatus = text;
    el.textContent = text;
  }
}

/* ---------------------------------------------------------
   Typing
--------------------------------------------------------- */
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Lays out the whole sentence up front with every character hidden, so
 * typing only fades characters in -- words never re-wrap mid-type. The
 * real sentence sits in a visually-hidden span, so screen readers hear
 * it once instead of letter by letter.
 */
function prepareTyping(el, text) {
  el.textContent = "";
  const sr = document.createElement("span");
  sr.className = "wg-sr";
  sr.textContent = text;
  el.appendChild(sr);
  const chars = [];
  const words = text.split(" ");

  words.forEach((word, i) => {
    const w = document.createElement("span");
    w.className = "wg-w";
    w.setAttribute("aria-hidden", "true");
    for (const ch of word) {
      const c = document.createElement("span");
      c.className = "wg-c";
      c.textContent = ch;
      w.appendChild(c);
      chars.push(c);
    }
    el.appendChild(w);
    if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
  });
  return chars;
}

async function typeChars(chars, perChar, myRun) {
  let prev = null;
  for (let i = 0; i < chars.length; i++) {
    if (myRun !== runId) return;
    if (skipTyping) {
      chars.slice(i).forEach((c) => c.classList.add("on"));
      prev?.classList.remove("cur");
      chars.at(-1).classList.add("cur");
      return;
    }
    const c = chars[i];
    prev?.classList.remove("cur");
    c.classList.add("on", "cur");
    prev = c;

    const ch = c.textContent;
    const pause = ".!?".includes(ch) ? 260 : ",".includes(ch) ? 150 : 0;
    await wait(perChar + Math.random() * 22 + pause);
  }
}

/* ---------------------------------------------------------
   3D cube: slow spin, follows the finger / cursor / tilt, and when
   the app is installed it turns to show the lit check face.
--------------------------------------------------------- */
function createCube(el) {
  const still = reduceMotion();
  let ry = -28;
  let rx = -18;
  const vr = 24; // degrees per second
  let tiltX = 0;
  let tiltY = 0;
  let curX = 0;
  let curY = 0;
  let celebrating = false;
  let target = { rx: -90, ry: 0 };
  let raf = 0;
  let last = performance.now();

  const apply = () => {
    el.style.transform = `rotateX(${(rx + curY).toFixed(2)}deg) rotateY(${(ry + curX).toFixed(2)}deg)`;
  };

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (celebrating) {
      const k = Math.min(1, dt * 4);
      ry += (target.ry - ry) * k;
      rx += (target.rx - rx) * k;
    } else {
      ry += vr * dt;
    }
    curX += (tiltX - curX) * Math.min(1, dt * 6);
    curY += (tiltY - curY) * Math.min(1, dt * 6);

    apply();
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  };
  const onVisibility = () => (document.hidden ? cancelAnimationFrame(raf) : start());

  const onPointer = (e) => {
    tiltX = (e.clientX / window.innerWidth - 0.5) * 26;
    tiltY = -(e.clientY / window.innerHeight - 0.5) * 18;
  };
  const onOrient = (e) => {
    if (e.gamma == null || e.beta == null) return;
    tiltX = Math.max(-1, Math.min(1, e.gamma / 35)) * 13;
    tiltY = Math.max(-1, Math.min(1, (e.beta - 50) / 30)) * -9;
  };

  if (still) {
    apply(); // a static pose; no animation loop at all
  } else {
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onPointer, { passive: true });
    // iOS asks permission for motion data; only use it where it's free.
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== "function") {
      window.addEventListener("deviceorientation", onOrient, { passive: true });
    }
    start();
  }

  return {
    celebrate() {
      celebrating = true;
      target = { rx: -90, ry: Math.round(ry / 360) * 360 };
      tiltX = 0;
      tiltY = 0;
      if (still) {
        rx = target.rx;
        ry = target.ry;
        apply();
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
    },
  };
}
