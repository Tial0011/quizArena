import { db } from "../firebase/config.js";
import { showLoadingOverlay } from "./loadingOverlay.js"; // ✅ added

import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  confirmFlutterwavePurchase,
  getUserOwnedQuizIds,
} from "./purchaseService.js";
import { getUserData } from "../auth.js";
import { registerBackHandler } from "./navigation.js";
import { renderStudentDashboard } from "./dashboard.js";

/* =========================================================
   FLUTTERWAVE CONFIG
========================================================= */
const FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK-b1678b9192cb9718206cded093336375-X";

/* =========================================================
   MODULE STATE
========================================================= */
let quizzesCache = [];
let ownedQuizIds = new Set();
let currentUserId = null;
let currentUserData = null;
let cart = new Set(); // quiz ids the student has ticked for one combined payment
let isPurchasing = false;
let lastTier = -1;
let selectedSubject = "All";
let selectedLevel = "100";
let selectedSemester = "1";

/* =========================================================
   PUBLIC ENTRY POINT
   Matches the same call pattern as renderPracticeArena(userData)
   and renderMyQuizzes(userData): takes the signed-in user's data
   object and renders itself into the #app container.
========================================================= */
export async function renderMarketplace(userData = {}) {
  history.pushState({ page: "marketplace" }, "", "");
  await renderMarketplacePage(userData);
}

async function renderMarketplacePage(userData) {
  const app = document.getElementById("app");
  currentUserData = userData;
  currentUserId = userData.id;

  registerBackHandler(() => {
    renderStudentDashboard(currentUserData);
  });

  // NOTE: this page used to render directly onto #app with no wrapper
  // of its own — it inherited whatever spacing the page it was called
  // from happened to have (or didn't). `.marketplace-page` below is a
  // self-contained shell (own background, padding, radius, shadow) so
  // this page looks right regardless of what wraps #app.
  app.innerHTML = `
    <div class="marketplace-page">
      <div class="marketplace-header">
        <h2>Marketplace</h2>
        <p class="marketplace-subtitle">Tap quizzes to build your study pack. Pay once.</p>
      </div>

      <div class="marketplace-toolbar-panel">
        <div id="marketplaceLevelSemesterFilters" class="marketplace-level-semester-filters"></div>

        <div class="marketplace-toolbar">
          <input
            type="text"
            id="marketplaceSearch"
            class="marketplace-search"
            placeholder="Search by title, subject or week..."
          />

          <div id="marketplaceFilters" class="marketplace-filters"></div>
        </div>
      </div>

      <div id="marketplaceSummary" class="marketplace-summary"></div>

      <div id="marketplaceList" class="marketplace-list-wrapper"></div>

      ${renderPurchaseDialogMarkup()}
    </div>
    ${renderCartBarMarkup()}
  `;

  attachDialogEventListeners();
  attachCartBarListeners();

  const list = document.getElementById("marketplaceList");

  // ✅ Show spinner overlay while loading
  const stopLoading = showLoadingOverlay(
    list,
    [
      "Loading marketplace quizzes...",
      "Fetching available subjects...",
      "Preparing quiz cards...",
      "Almost ready...",
    ],
    { subtitle: "This usually takes just a moment" },
  );

  await loadMarketplaceData();
  restoreCart();

  stopLoading(); // ✅ remove overlay once data is ready
  renderMarketplaceList();
  renderMarketplaceFilters();
  renderLevelSemesterFilters();
  renderMarketplaceSummary();
  attachSearchListener();
  syncCartUI({ silent: true });
}

/* =========================================================
   DATA LOADING
========================================================= */
async function loadMarketplaceData() {
  const [quizzes, owned] = await Promise.all([
    loadActiveQuizzes(),
    getUserOwnedQuizIds(currentUserId),
  ]);

  quizzesCache = quizzes;
  ownedQuizIds = owned;
}

async function loadActiveQuizzes() {
  const q = query(collection(db, "quizzes"), where("active", "==", true));
  const snapshot = await getDocs(q);

  const quizzes = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    // Backward compatibility: quizzes created before level/semester
    // existed default to 100 Level, Semester 2.
    quizzes.push({
      id: docSnap.id,
      ...data,
      level: data.level ?? 100,
      semester: data.semester ?? 2,
    });
  });

  return quizzes;
}

/* =========================================================
   LEVEL / SEMESTER FILTERING
========================================================= */
function getLevelSemesterFilteredQuizzes() {
  return quizzesCache.filter(
    (quiz) =>
      String(quiz.level) === selectedLevel &&
      String(quiz.semester) === selectedSemester,
  );
}

function renderLevelSemesterFilters() {
  const container = document.getElementById("marketplaceLevelSemesterFilters");
  if (!container) return;

  const levels = sortDropdownValues([
    ...new Set(quizzesCache.map((quiz) => String(quiz.level))),
  ]);
  const semesters = sortDropdownValues([
    ...new Set(quizzesCache.map((quiz) => String(quiz.semester))),
  ]);

  container.innerHTML = `
    <div class="marketplace-level-filter">
      <label for="levelSelect">Level</label>
      <select id="levelSelect">
        ${levels
          .map(
            (level) => `
              <option value="${level}" ${level === selectedLevel ? "selected" : ""}>
                ${Number.isFinite(Number(level)) ? `${level} Level` : level}
              </option>
            `,
          )
          .join("")}
      </select>
    </div>

    <div class="marketplace-semester-filter">
      <label for="semesterSelect">Semester</label>
      <select id="semesterSelect">
        ${semesters
          .map(
            (semester) => `
              <option value="${semester}" ${semester === selectedSemester ? "selected" : ""}>
  ${
    semester === "1"
      ? "First Semester"
      : semester === "2"
        ? " Second Semester"
        : `Semester ${semester}`
  }
</option>
            `,
          )
          .join("")}
      </select>
    </div>
  `;

  document.getElementById("levelSelect").addEventListener("change", (e) => {
    selectedLevel = e.target.value;
    selectedSubject = "All"; // available subjects may differ per level/semester
    renderMarketplaceFilters();
    renderMarketplaceList(
      document.getElementById("marketplaceSearch").value.trim().toLowerCase(),
    );
    renderMarketplaceSummary();
  });

  document.getElementById("semesterSelect").addEventListener("change", (e) => {
    selectedSemester = e.target.value;
    selectedSubject = "All";
    renderMarketplaceFilters();
    renderMarketplaceList(
      document.getElementById("marketplaceSearch").value.trim().toLowerCase(),
    );
    renderMarketplaceSummary();
  });
}

// Numeric values sort ascending; non-numeric values (e.g. "PostUtme")
// sort alphabetically after all numeric ones.
function sortDropdownValues(values) {
  return values.sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    const aIsNum = !Number.isNaN(numA);
    const bIsNum = !Number.isNaN(numB);

    if (aIsNum && bIsNum) return numA - numB;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b);
  });
}

/* =========================================================
   RENDER QUIZ GRID
========================================================= */
function attachSearchListener() {
  const search = document.getElementById("marketplaceSearch");

  search.addEventListener("input", () => {
    const term = search.value.trim().toLowerCase();
    renderMarketplaceList(term);
    renderMarketplaceSummary(term);
  });
}

function renderMarketplaceList(searchTerm = "") {
  const list = document.getElementById("marketplaceList");

  const filtered = quizzesCache.filter((quiz) => {
    const week = `week ${quiz.week}`;

    const matchesSearch =
      quiz.title.toLowerCase().includes(searchTerm) ||
      quiz.subjectName.toLowerCase().includes(searchTerm) ||
      week.includes(searchTerm);

    const matchesSubject =
      selectedSubject === "All" || quiz.subjectName === selectedSubject;

    const matchesLevel = String(quiz.level) === selectedLevel;
    const matchesSemester = String(quiz.semester) === selectedSemester;

    return matchesSearch && matchesSubject && matchesLevel && matchesSemester;
  });

  if (filtered.length === 0) {
    list.innerHTML = renderEmptyState();
    return;
  }

  const grouped = filtered.reduce((groups, quiz) => {
    if (!groups[quiz.subjectName]) {
      groups[quiz.subjectName] = [];
    }

    groups[quiz.subjectName].push(quiz);
    return groups;
  }, {});

  list.innerHTML = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, quizzes]) => {
      quizzes.sort((a, b) => a.week - b.week);
      const buyable = quizzes.filter((q) => !ownedQuizIds.has(q.id));
      return `
      <section class="marketplace-section" data-subject-section="${esc(subject)}">
        <div class="marketplace-section-header">
          <h3 class="marketplace-section-title">${esc(subject)}</h3>
          <span class="marketplace-section-count">
            ${quizzes.length} Quiz${quizzes.length > 1 ? "zes" : ""}
          </span>
          ${
            buyable.length > 1
              ? `<button type="button" class="mk-select-all" data-action="select-section" data-subject="${esc(subject)}"></button>`
              : ""
          }
        </div>

        <div class="marketplace-grid">
          ${quizzes.map(renderQuizCard).join("")}
        </div>
      </section>
    `;
    })
    .join("");
  attachCardEventListeners(list);
  syncCartUI({ silent: true });
}

function renderMarketplaceFilters() {
  const container = document.getElementById("marketplaceFilters");
  if (!container) return;

  const levelSemesterQuizzes = getLevelSemesterFilteredQuizzes();
  const subjects = [
    "All",
    ...new Set(levelSemesterQuizzes.map((quiz) => quiz.subjectName)),
  ].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)));

  container.innerHTML = subjects
    .map(
      (subject) => `
        <button
          type="button"
          class="marketplace-filter-btn${subject === selectedSubject ? " active" : ""}"
          data-subject="${subject}"
        >
          ${subject}
        </button>
      `,
    )
    .join("");

  container.querySelectorAll("[data-subject]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSubject = btn.dataset.subject;
      const term = document
        .getElementById("marketplaceSearch")
        .value.trim()
        .toLowerCase();
      renderMarketplaceFilters();
      renderMarketplaceList(term);
      renderMarketplaceSummary(term);
    });
  });
}

function renderMarketplaceSummary(searchTerm = "") {
  const summary = document.getElementById("marketplaceSummary");
  if (!summary) return;

  const visibleQuizzes = quizzesCache.filter((quiz) => {
    const week = `week ${quiz.week}`;

    const matchesSearch =
      quiz.title.toLowerCase().includes(searchTerm) ||
      quiz.subjectName.toLowerCase().includes(searchTerm) ||
      week.includes(searchTerm);

    const matchesSubject =
      selectedSubject === "All" || quiz.subjectName === selectedSubject;

    const matchesLevel = String(quiz.level) === selectedLevel;

    const matchesSemester = String(quiz.semester) === selectedSemester;

    return matchesSearch && matchesSubject && matchesLevel && matchesSemester;
  });

  const subjectCount = new Set(visibleQuizzes.map((quiz) => quiz.subjectName))
    .size;

  const purchasedCount = visibleQuizzes.filter((quiz) =>
    ownedQuizIds.has(quiz.id),
  ).length;

  const totalPurchased = ownedQuizIds.size;

  summary.innerHTML = `
    <div class="marketplace-stat">
      <span class="marketplace-stat-value">
        ${visibleQuizzes.length}
      </span>
      <span class="marketplace-stat-label">
        Quizzes
      </span>
    </div>

    <div class="marketplace-stat">
      <span class="marketplace-stat-value">
        ${subjectCount}
      </span>
      <span class="marketplace-stat-label">
        Subjects
      </span>
    </div>

    <div class="marketplace-stat">
      <span class="marketplace-stat-value">
        ${purchasedCount}
      </span>
      <span class="marketplace-stat-label">
        Purchased
      </span>
    </div>

    <div class="marketplace-stat marketplace-stat-global">
      <span class="marketplace-stat-value">
        ${totalPurchased}
      </span>
      <span class="marketplace-stat-label">
        Total Purchased
      </span>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="marketplace-empty-state">
      <p>No quizzes available right now.</p>
    </div>
  `;
}

function renderQuizCard(quiz) {
  const isOwned = ownedQuizIds.has(quiz.id);

  return `
    <div class="marketplace-card${isOwned ? " is-owned" : ""}" data-id="${quiz.id}" ${
      isOwned ? "" : `data-action="toggle" role="button" tabindex="0" aria-pressed="false"`
    }>
      <div class="marketplace-card-top">
        <span class="badge badge-subject">${esc(quiz.subjectName)}</span>
        <span class="badge badge-week">Week ${esc(quiz.week)}</span>
      </div>

      <h3 class="marketplace-card-title">${esc(quiz.title)}</h3>

      <div class="marketplace-card-footer">
        <span class="badge badge-price">${money(quiz.price)}</span>

        ${
          isOwned
            ? `
              <div class="owned-actions">
                <span class="badge badge-owned">Purchased ✅</span>
                <button class="btn-open" data-action="open" data-id="${quiz.id}">
                  Open Quiz
                </button>
              </div>
            `
            : `
              <span class="mk-add" aria-hidden="true">
                <span class="mk-add-plus">+</span><span class="mk-add-label">Add</span>
              </span>
            `
        }
      </div>
    </div>
  `;
}

/* =========================================================
   STUDY PACK CART
   Students tick as many quizzes as they like and pay ONCE.
   The whole thing is built for a short attention span:
   - one tap on a card = added (no dialog, no page change)
   - instant feedback: card lights up, phone buzzes, total rolls
   - a goal meter ("2 more to Scholar Pack") pulls them forward
   - a pack-rank level-up gets a small celebration
   Nothing here changes prices; the total is always the plain sum.
========================================================= */
const TIERS = [
  { at: 1, name: "Warm-up Pack", emoji: "🌱" },
  { at: 3, name: "Scholar Pack", emoji: "📘" },
  { at: 5, name: "Topper Pack", emoji: "🔥" },
  { at: 8, name: "Legend Pack", emoji: "👑" },
];

const cartKey = () => `qa_cart_${currentUserId}`;

function restoreCart() {
  cart = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(cartKey()) || "[]");
    const live = new Map(quizzesCache.map((q) => [q.id, q]));
    // drop anything that's been bought or removed since last visit
    saved.forEach((id) => live.has(id) && !ownedQuizIds.has(id) && cart.add(id));
  } catch {
    /* private mode: cart just starts empty */
  }
  lastTier = tierIndex(cart.size);
}

function persistCart() {
  try {
    localStorage.setItem(cartKey(), JSON.stringify([...cart]));
  } catch {
    /* ignore */
  }
}

const cartQuizzes = () => quizzesCache.filter((q) => cart.has(q.id));
const cartTotal = () => cartQuizzes().reduce((sum, q) => sum + Number(q.price || 0), 0);
const money = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;

function tierIndex(count) {
  let idx = -1;
  TIERS.forEach((t, i) => count >= t.at && (idx = i));
  return idx;
}

function buzz(pattern = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function toggleQuiz(id) {
  if (ownedQuizIds.has(id)) return;
  if (cart.has(id)) cart.delete(id);
  else {
    cart.add(id);
    buzz(12);
  }
  persistCart();
  syncCartUI();
}

function toggleSubject(subject) {
  const ids = quizzesCache
    .filter(
      (q) =>
        q.subjectName === subject &&
        String(q.level) === selectedLevel &&
        String(q.semester) === selectedSemester &&
        !ownedQuizIds.has(q.id),
    )
    .map((q) => q.id);
  const allIn = ids.every((id) => cart.has(id));
  ids.forEach((id) => (allIn ? cart.delete(id) : cart.add(id)));
  if (!allIn) buzz([14, 30, 14]);
  persistCart();
  syncCartUI();
}

function renderCartBarMarkup() {
  return `
    <div id="mkCartBar" class="mk-cartbar" hidden>
      <button type="button" class="mk-cartbar-info" id="mkCartOpen" aria-label="Review your study pack">
        <span class="mk-rank" id="mkRank"></span>
        <span class="mk-meter" aria-hidden="true"><i id="mkMeterFill"></i></span>
        <span class="mk-goal" id="mkGoal"></span>
      </button>
      <button type="button" class="mk-cartbar-pay" id="mkCartPay">
        <span class="mk-pay-count" id="mkPayCount"></span>
        <span class="mk-pay-total" id="mkPayTotal">₦0</span>
        <span class="mk-pay-cta">Checkout →</span>
      </button>
    </div>
  `;
}

function attachCartBarListeners() {
  document.getElementById("mkCartOpen").addEventListener("click", openPurchaseDialog);
  document.getElementById("mkCartPay").addEventListener("click", openPurchaseDialog);
}

let shownTotal = 0;
function rollNumber(el, from, to) {
  if (!el) return;
  if (calm() || from === to) {
    el.textContent = money(to);
    return;
  }
  const start = performance.now();
  const dur = 320;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = money(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function syncCartUI({ silent = false } = {}) {
  // cards
  document.querySelectorAll(".marketplace-card[data-action='toggle']").forEach((card) => {
    const on = cart.has(card.dataset.id);
    card.classList.toggle("is-selected", on);
    card.setAttribute("aria-pressed", String(on));
    const label = card.querySelector(".mk-add-label");
    const plus = card.querySelector(".mk-add-plus");
    if (label) label.textContent = on ? "Added" : "Add";
    if (plus) plus.textContent = on ? "✓" : "+";
  });

  // per-subject select-all buttons
  document.querySelectorAll(".mk-select-all").forEach((btn) => {
    const section = btn.closest(".marketplace-section");
    const cards = [...section.querySelectorAll(".marketplace-card[data-action='toggle']")];
    const allIn = cards.length > 0 && cards.every((c) => cart.has(c.dataset.id));
    btn.textContent = allIn ? "Clear subject" : `Select all ${cards.length}`;
  });

  // cart bar
  const bar = document.getElementById("mkCartBar");
  const page = document.querySelector(".marketplace-page");
  if (!bar) return;

  const count = cart.size;
  const total = cartTotal();
  const wasHidden = bar.hidden;
  bar.hidden = count === 0;
  page?.classList.toggle("has-cart", count > 0);

  if (count > 0) {
    const tIdx = tierIndex(count);
    const tier = TIERS[tIdx];
    const next = TIERS[tIdx + 1];
    const prev = tier ? tier.at : 0;
    const pct = next ? Math.round(((count - prev) / (next.at - prev)) * 100) : 100;
    const subjects = new Set(cartQuizzes().map((q) => q.subjectName)).size;

    document.getElementById("mkRank").textContent = `${tier.emoji} ${tier.name}`;
    document.getElementById("mkMeterFill").style.width = `${Math.max(8, pct)}%`;
    document.getElementById("mkGoal").textContent = next
      ? `Add ${next.at - count} more to reach ${next.name}`
      : `Max rank · ${subjects} subject${subjects > 1 ? "s" : ""} covered`;
    document.getElementById("mkPayCount").textContent = `${count} quiz${count > 1 ? "zes" : ""}`;
    rollNumber(document.getElementById("mkPayTotal"), wasHidden ? 0 : shownTotal, total);

    if (!silent && tIdx > lastTier && count > 1) {
      celebrate(bar, 18);
      buzz([20, 40, 20]);
    }
    lastTier = tIdx;
  } else {
    lastTier = -1;
  }
  shownTotal = total;
}

/** A small burst of brand-coloured confetti. Skipped for reduced-motion. */
function celebrate(anchor, n = 28) {
  if (calm()) return;
  const rect = anchor.getBoundingClientRect();
  const colors = ["#389695", "#eebf92", "#2d190b", "#6fbab9", "#c98a4b"];
  const layer = document.createElement("div");
  layer.className = "mk-confetti";
  for (let i = 0; i < n; i++) {
    const bit = document.createElement("i");
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = 70 + Math.random() * 110;
    bit.style.cssText = `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;background:${colors[i % colors.length]};--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist - 60}px;--r:${Math.random() * 540 - 270}deg`;
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1300);
}

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* =========================================================
   CARD ACTIONS
========================================================= */
function attachCardEventListeners(list) {
  list.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", (e) => {
      // "Open Quiz" lives inside an owned card; never let it bubble into a toggle
      e.stopPropagation();
      handleCardAction(el.dataset.action, el.dataset.id, el);
    });
    if (el.dataset.action === "toggle") {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleQuiz(el.dataset.id);
        }
      });
    }
  });
}

function handleCardAction(action, quizId, el) {
  switch (action) {
    case "toggle":
      toggleQuiz(quizId);
      break;
    case "select-section":
      toggleSubject(el.dataset.subject);
      break;
    case "open":
      handleOpenQuizClick(quizId);
      break;
    default:
      console.warn(`Unhandled marketplace action: ${action}`);
  }
}

async function handleOpenQuizClick(quizId) {
  const quiz = quizzesCache.find((q) => q.id === quizId);
  const { startPurchasedQuiz } = await import("./purchasedQuiz.js");
  startPurchasedQuiz(currentUserData, quizId, quiz?.title || "Quiz");
}

/* =========================================================
   CHECKOUT SHEET + FLUTTERWAVE (one payment for the whole pack)
========================================================= */
function renderPurchaseDialogMarkup() {
  return `
    <div id="purchaseDialogOverlay" class="purchase-dialog-overlay" hidden>
      <div class="purchase-dialog" id="purchaseDialogBox" role="dialog" aria-modal="true" aria-label="Your study pack"></div>
    </div>
  `;
}

function checkoutMarkup() {
  const items = cartQuizzes();
  const total = cartTotal();
  return `
    <div class="mk-sheet-head">
      <h3>Your study pack</h3>
      <span class="mk-sheet-count">${items.length} quiz${items.length > 1 ? "zes" : ""}</span>
    </div>

    <ul class="mk-sheet-list" id="mkSheetList">
      ${items
        .map(
          (q) => `
        <li class="mk-sheet-item">
          <div class="mk-sheet-item-text">
            <strong>${esc(q.title)}</strong>
            <span>${esc(q.subjectName)} · Week ${esc(q.week)}</span>
          </div>
          <span class="mk-sheet-item-price">${money(q.price)}</span>
          <button type="button" class="mk-sheet-remove" data-remove="${q.id}" aria-label="Remove ${esc(q.title)}">✕</button>
        </li>`,
        )
        .join("")}
    </ul>

    <div class="mk-sheet-total">
      <span>Total</span>
      <strong id="mkSheetTotal">${money(total)}</strong>
    </div>

    <p class="mk-sheet-error" id="mkCheckoutError" role="alert" hidden></p>
    <p class="purchase-dialog-notice">
      Secure payment with Flutterwave: card, bank transfer or USSD. One payment unlocks everything above.
    </p>

    <div class="purchase-dialog-actions">
      <button type="button" id="cancelPurchaseBtn" class="btn-secondary">Keep browsing</button>
      <button type="button" id="confirmPurchaseBtn" class="btn-primary">Pay ${money(total)}</button>
    </div>
  `;
}

function attachDialogEventListeners() {
  // Clicking the dark overlay cancels, but NOT while a payment is being
  // processed: Flutterwave's own modal closing can leak a click through to
  // this overlay and hide it before verification has finished.
  document.getElementById("purchaseDialogOverlay").addEventListener("click", (e) => {
    if (e.target.id === "purchaseDialogOverlay" && !isPurchasing) closePurchaseDialog();
  });
}

function openPurchaseDialog() {
  if (cart.size === 0) return;
  paintCheckout();
  document.getElementById("purchaseDialogOverlay").hidden = false;
}

function paintCheckout() {
  const box = document.getElementById("purchaseDialogBox");
  box.innerHTML = checkoutMarkup();
  box.querySelector("#cancelPurchaseBtn").addEventListener("click", closePurchaseDialog);
  box.querySelector("#confirmPurchaseBtn").addEventListener("click", handleConfirmPurchase);
  box.querySelector("#mkSheetList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn || isPurchasing) return;
    cart.delete(btn.dataset.remove);
    persistCart();
    syncCartUI();
    if (cart.size === 0) closePurchaseDialog();
    else paintCheckout();
  });
}

function closePurchaseDialog() {
  document.getElementById("purchaseDialogOverlay").hidden = true;
}

function showCheckoutError(msg) {
  const el = document.getElementById("mkCheckoutError");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.hidden = false;
}

function resetPayButton() {
  isPurchasing = false;
  const confirmBtn = document.getElementById("confirmPurchaseBtn");
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = `Pay ${money(cartTotal())}`;
  }
  document.getElementById("cancelPurchaseBtn")?.removeAttribute("disabled");
}

/**
 * Swaps the sheet into an explicit success state. The point of this
 * screen is to turn the buying mood into a studying mood: the main
 * button starts the first quiz right now.
 */
function showPurchaseSuccess(boughtQuizzes) {
  const box = document.getElementById("purchaseDialogBox");
  if (!box) return;
  document.getElementById("purchaseDialogOverlay").hidden = false;

  const first = boughtQuizzes[0];
  box.innerHTML = `
    <div class="purchase-success">
      <div class="purchase-success-check">✓</div>
      <h3>${boughtQuizzes.length > 1 ? `${boughtQuizzes.length} quizzes unlocked!` : "Quiz unlocked!"}</h3>
      <ul class="purchase-success-list">
        ${boughtQuizzes.map((q) => `<li>${esc(q.title)}</li>`).join("")}
      </ul>
      <p class="purchase-success-note">Momentum is highest right now. Take one quiz while it's fresh.</p>
      ${
        first
          ? `<button type="button" class="btn-primary" id="mkStartNow">Start "${esc(first.title)}" now</button>`
          : ""
      }
      <button type="button" class="btn-secondary mk-later" id="mkKeepBrowsing">Not now</button>
    </div>
  `;
  celebrate(box.querySelector(".purchase-success-check"), 36);
  buzz([30, 50, 30]);

  const refresh = async () => {
    closePurchaseDialog();
    await renderMarketplacePage(currentUserData);
  };
  document.getElementById("mkKeepBrowsing").addEventListener("click", refresh, { once: true });
  document.getElementById("mkStartNow")?.addEventListener(
    "click",
    async () => {
      closePurchaseDialog();
      const { startPurchasedQuiz } = await import("./purchasedQuiz.js");
      startPurchasedQuiz(currentUserData, first.id, first.title);
    },
    { once: true },
  );
}

/**
 * FLUTTERWAVE PAYMENT FLOW (multi-quiz)
 * 1. One checkout for the summed price of everything in the cart.
 * 2. The client never trusts Flutterwave's callback: it calls the
 *    verifyFlutterwavePurchase Cloud Function, which re-verifies the
 *    transaction with Flutterwave and re-adds up the REAL prices itself.
 * 3. Bank transfers often report "pending"; those get polled.
 */
async function handleConfirmPurchase() {
  if (cart.size === 0 || isPurchasing) return;

  const items = cartQuizzes().filter((q) => !ownedQuizIds.has(q.id));
  const ids = items.map((q) => q.id);
  const total = items.reduce((sum, q) => sum + Number(q.price || 0), 0);
  if (ids.length === 0 || total <= 0) return;

  isPurchasing = true;
  let paymentResultReceived = false; // tells a real cancel apart from the modal closing after success

  const confirmBtn = document.getElementById("confirmPurchaseBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Processing...";
  document.getElementById("cancelPurchaseBtn").disabled = true;
  document.getElementById("mkCheckoutError").hidden = true;

  const txRef = `pack_${currentUserId}_${Date.now()}`;

  if (typeof window.FlutterwaveCheckout !== "function") {
    resetPayButton();
    showCheckoutError("Payment is still loading. Check your connection and try again.");
    return;
  }

  window.FlutterwaveCheckout({
    public_key: FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: txRef,
    amount: total,
    currency: "NGN",
    payment_options: "card,ussd,banktransfer",
    customer: {
      email: currentUserData.email,
      name: currentUserData.fullName || currentUserData.name || "Student",
    },
    customizations: {
      title: "QuizArena",
      description: ids.length === 1 ? items[0].title : `${ids.length} quizzes`,
    },
    callback: async (response) => {
      paymentResultReceived = true;

      // The inline widget reports success as "completed"; the newer flow says "successful".
      if (response.status === "successful" || response.status === "completed") {
        await finalizePurchase(response, ids);
        return;
      }
      if (response.status === "pending") {
        confirmBtn.textContent = "Confirming payment...";
        await pollForConfirmation(response, ids);
        return;
      }
      resetPayButton();
      showCheckoutError("Payment was not completed. You have not been charged.");
    },
    onclose: () => {
      if (paymentResultReceived) return;
      resetPayButton();
    },
  });
}

async function onPurchaseConfirmed(result, ids) {
  isPurchasing = false;
  const doneIds = Array.isArray(result.purchasedIds) && result.purchasedIds.length ? result.purchasedIds : ids;

  const fresh = await getUserData(currentUserId);
  if (fresh) currentUserData = fresh;

  const bought = quizzesCache.filter((q) => doneIds.includes(q.id) || ids.includes(q.id));
  bought.forEach((q) => {
    ownedQuizIds.add(q.id);
    cart.delete(q.id);
  });
  persistCart();
  showPurchaseSuccess(bought);
}

async function finalizePurchase(response, ids) {
  const result = await confirmFlutterwavePurchase(
    currentUserId,
    ids,
    response.tx_ref,
    response.transaction_id,
  );

  if (!result.success) {
    console.warn("[purchase] Verification failed", result.message);
    resetPayButton();
    showCheckoutError(result.message || "Payment verification failed. Please contact support.");
    return;
  }
  await onPurchaseConfirmed(result, ids);
}

async function pollForConfirmation(response, ids, attempt = 1) {
  const maxAttempts = 6; // ~30s at a 5s interval
  const intervalMs = 5000;

  const stopLoading = showLoadingOverlay(
    document.getElementById("purchaseDialogBox"),
    ["Confirming your bank transfer...", "This can take a moment...", "Almost there..."],
    { subtitle: "Please don't close this window" },
  );

  let result;
  try {
    result = await confirmFlutterwavePurchase(currentUserId, ids, response.tx_ref, response.transaction_id);
  } finally {
    stopLoading();
  }

  if (result.success) {
    await onPurchaseConfirmed(result, ids);
    return;
  }

  if (attempt >= maxAttempts) {
    console.warn("[purchase] Gave up polling after max attempts", result.message);
    resetPayButton();
    showCheckoutError(
      "We're still confirming your transfer. This can take a few minutes. Check back on the Marketplace shortly, or contact support with your reference.",
    );
    return;
  }

  setTimeout(() => pollForConfirmation(response, ids, attempt + 1), intervalMs);
}
