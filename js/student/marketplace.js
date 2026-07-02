import { db } from "../firebase/config.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { purchaseQuiz, getUserOwnedQuizIds } from "./purchaseService.js";
import { renderStudentDashboard } from "./dashboard.js";
import { registerBackHandler } from "./navigation.js";

/* =========================================================
   MODULE STATE
========================================================= */
let quizzesCache = [];
let ownedQuizIds = new Set();
let currentUserId = null;
let selectedQuizForPurchase = null;
let isPurchasing = false;

/* =========================================================
   PUBLIC ENTRY POINT
   Matches the same call pattern as renderPracticeArena(userData)
   and renderMyQuizzes(userData): takes the signed-in user's data
   object and renders itself into the #app container.

   NOTE: adjust `userData.uid` below if your app stores the
   signed-in user's id under a different field.
========================================================= */
export async function renderMarketplace(userData = {}) {
  history.pushState(
    {
      page: "marketplace",
    },
    "",
    "",
  );
  const app = document.getElementById("app");
  currentUserId = userData.id;

  app.innerHTML = `
    <div class="admin-card">
      <div class="marketplace-header">
        <h2>Marketplace</h2>
        <p class="marketplace-subtitle">Browse and unlock quizzes</p>
      </div>

      <div id="marketplaceList" class="marketplace-list-wrapper">
        <p>Loading...</p>
      </div>
    </div>

    ${renderPurchaseDialogMarkup()}
  `;

  attachDialogEventListeners();
  await loadMarketplaceData();
  renderMarketplaceList();
  registerBackHandler(() => {
    renderStudentDashboard(userData);
  });
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
    quizzes.push({ id: docSnap.id, ...docSnap.data() });
  });

  return quizzes;
}

/* =========================================================
   RENDER QUIZ GRID
========================================================= */
function renderMarketplaceList() {
  const list = document.getElementById("marketplaceList");

  if (quizzesCache.length === 0) {
    list.innerHTML = renderEmptyState();
    return;
  }

  list.innerHTML = `
    <div class="marketplace-grid">
      ${quizzesCache.map(renderQuizCard).join("")}
    </div>
  `;

  attachCardEventListeners(list);
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
    <div class="marketplace-card" data-id="${quiz.id}">
      <div class="marketplace-card-top">
        <span class="badge badge-subject">${quiz.subjectName}</span>
        <span class="badge badge-week">Week ${quiz.week}</span>
      </div>

      <h3 class="marketplace-card-title">${quiz.title}</h3>

      <div class="marketplace-card-footer">
        <span class="badge badge-price">₦${quiz.price}</span>

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
              <button class="btn-buy" data-action="buy" data-id="${quiz.id}">
                Buy
              </button>
            `
        }
      </div>
    </div>
  `;
}

/* =========================================================
   CARD ACTIONS
========================================================= */
function attachCardEventListeners(list) {
  list.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleCardAction(btn.dataset.action, btn.dataset.id);
    });
  });
}

function handleCardAction(action, quizId) {
  switch (action) {
    case "buy":
      handleBuyClick(quizId);
      break;
    case "open":
      handleOpenQuizClick(quizId);
      break;
    default:
      console.warn(`Unhandled marketplace action: ${action}`);
  }
}

function handleBuyClick(quizId) {
  const quiz = quizzesCache.find((q) => q.id === quizId);
  if (!quiz) return;
  openPurchaseDialog(quiz);
}

/**
 * Opens the existing purchased-quiz experience.
 *
 * This hooks into whatever navigation system the app already uses
 * for opening a quiz a user owns. Wire it up one of these ways:
 *
 *   1. If there's a global router/navigation function already,
 *      call it directly here, e.g.:
 *        window.openPurchasedQuiz(quizId);
 *
 *   2. If navigation is hash-based, replace the fallback below with
 *      your actual route, e.g. "#/my-quizzes/" + quizId
 *
 * Left as a small named function so it's a single place to edit.
 */
function handleOpenQuizClick(quizId) {
  if (typeof window.openPurchasedQuiz === "function") {
    window.openPurchasedQuiz(quizId);
    return;
  }

  // Fallback: adjust to match your existing quiz-taking route.
  window.location.hash = `#/quiz/${quizId}`;
}

/* =========================================================
   MOCK PURCHASE DIALOG
========================================================= */
function renderPurchaseDialogMarkup() {
  return `
    <div id="purchaseDialogOverlay" class="purchase-dialog-overlay" hidden>
      <div class="purchase-dialog">
        <h3>Purchase Quiz?</h3>

        <div class="purchase-dialog-details">
          <p class="purchase-dialog-title" id="purchaseDialogTitle"></p>
          <p class="purchase-dialog-price" id="purchaseDialogPrice"></p>
        </div>

        <p class="purchase-dialog-notice">
          This is a demo purchase. No payment will be made.
        </p>

        <div class="purchase-dialog-actions">
          <button type="button" id="cancelPurchaseBtn" class="btn-secondary">
            Cancel
          </button>
          <button type="button" id="confirmPurchaseBtn" class="btn-primary">
            Purchase
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachDialogEventListeners() {
  document
    .getElementById("cancelPurchaseBtn")
    .addEventListener("click", closePurchaseDialog);

  document
    .getElementById("confirmPurchaseBtn")
    .addEventListener("click", handleConfirmPurchase);

  // Clicking the dark overlay (outside the dialog box) also cancels.
  document
    .getElementById("purchaseDialogOverlay")
    .addEventListener("click", (e) => {
      if (e.target.id === "purchaseDialogOverlay") {
        closePurchaseDialog();
      }
    });
}

function openPurchaseDialog(quiz) {
  selectedQuizForPurchase = quiz;

  document.getElementById("purchaseDialogTitle").textContent = quiz.title;
  document.getElementById("purchaseDialogPrice").textContent = `₦${quiz.price}`;

  const confirmBtn = document.getElementById("confirmPurchaseBtn");
  confirmBtn.textContent = "Purchase";
  confirmBtn.disabled = false;

  document.getElementById("purchaseDialogOverlay").hidden = false;
}

function closePurchaseDialog() {
  selectedQuizForPurchase = null;
  document.getElementById("purchaseDialogOverlay").hidden = true;
}

/**
 * PAYSTACK INSERTION POINT
 * ------------------------
 * Right now this function calls purchaseQuiz() directly, simulating
 * a payment that already succeeded. To wire in real payments later,
 * replace the body of this function with:
 *
 *   1. Launch Paystack Checkout for selectedQuizForPurchase.price
 *   2. In Paystack's onSuccess callback, call:
 *        const result = await purchaseQuiz(currentUserId, selectedQuizForPurchase.id);
 *   3. Keep everything below (UI update / dialog close) unchanged.
 *
 * No other file needs to change — purchaseService.js and the rest
 * of the Marketplace UI stay exactly as they are.
 */
async function handleConfirmPurchase() {
  if (!selectedQuizForPurchase || isPurchasing) return;

  isPurchasing = true;
  const confirmBtn = document.getElementById("confirmPurchaseBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Processing...";

  const quizId = selectedQuizForPurchase.id;
  const result = await purchaseQuiz(currentUserId, quizId);

  isPurchasing = false;

  if (!result.success) {
    alert(result.message || "Purchase failed. Please try again.");
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Purchase";
    return;
  }

  ownedQuizIds.add(quizId);
  closePurchaseDialog();
  renderMarketplaceList();
}
