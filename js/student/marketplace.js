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
let selectedQuizForPurchase = null;
let isPurchasing = false;
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

  app.innerHTML = `
    <div class="admin-card">
     <div class="marketplace-header">
  <h2>Marketplace</h2>
  <p class="marketplace-subtitle">Browse and unlock quizzes</p>

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
  `;

  attachDialogEventListeners();

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

  stopLoading(); // ✅ remove overlay once data is ready
  renderMarketplaceList();
  renderMarketplaceFilters();
  renderLevelSemesterFilters();
  renderMarketplaceSummary();
  attachSearchListener();
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
  console.log("Marketplace quizzes:", quizzesCache);
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
      return `
      <section class="marketplace-section">
        <div class="marketplace-section-header">
          <h3 class="marketplace-section-title">${subject}</h3>
          <span class="marketplace-section-count">
            ${quizzes.length} Quiz${quizzes.length > 1 ? "zes" : ""}
          </span>
        </div>

        <div class="marketplace-grid">
          ${quizzes.map(renderQuizCard).join("")}
        </div>
      </section>
    `;
    })
    .join("");
  attachCardEventListeners(list);
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
   FLUTTERWAVE PURCHASE DIALOG
========================================================= */
function renderPurchaseDialogMarkup() {
  return `
    <div id="purchaseDialogOverlay" class="purchase-dialog-overlay" hidden>
      <div class="purchase-dialog" id="purchaseDialogBox">
        <h3>Purchase Quiz?</h3>

        <div class="purchase-dialog-details">
          <p class="purchase-dialog-title" id="purchaseDialogTitle"></p>
          <p class="purchase-dialog-price" id="purchaseDialogPrice"></p>
        </div>

        <p class="purchase-dialog-notice">
          You'll be redirected to Flutterwave to complete payment securely.
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
 * FLUTTERWAVE PAYMENT FLOW
 * ------------------------
 * 1. Opens Flutterwave's inline checkout for the selected quiz's price.
 * 2. On the client-side callback, does NOT trust response.status alone —
 *    calls confirmFlutterwavePurchase(), which hits the verifyFlutterwavePurchase
 *    Cloud Function to independently re-verify the transaction with
 *    Flutterwave's servers before anything gets written to Firestore.
 * 3. Card payments resolve with status "successful"/"cancelled" synchronously
 *    in this callback. Bank transfer payments are asynchronous — Flutterwave
 *    often reports "pending" here while it's still waiting on bank
 *    confirmation, sometimes for a couple of minutes. Treating "pending" as
 *    a hard failure is what was causing "payment not completed" to show up
 *    even though the transfer had gone through — so pending gets polled
 *    against the Cloud Function instead of being rejected outright.
 * 4. Only once the Cloud Function confirms success do we refresh user data
 *    and re-render the Marketplace.
 */
async function handleConfirmPurchase() {
  if (!selectedQuizForPurchase || isPurchasing) return;

  isPurchasing = true;
  const confirmBtn = document.getElementById("confirmPurchaseBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Processing...";

  const quiz = selectedQuizForPurchase;
  const txRef = `quiz_${quiz.id}_${currentUserId}_${Date.now()}`;

  console.log("[purchase] Launching Flutterwave checkout", {
    quizId: quiz.id,
    price: quiz.price,
    txRef,
  });

  window.FlutterwaveCheckout({
    public_key: FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: txRef,
    amount: quiz.price,
    currency: "NGN",
    payment_options: "card,ussd,banktransfer",
    customer: {
      email: currentUserData.email,
      name: currentUserData.fullName || currentUserData.name || "Student",
    },
    customizations: {
      title: "QuizArena",
      description: quiz.title,
    },
    callback: async (response) => {
      console.log("[purchase] Flutterwave callback fired", response);

      // Flutterwave's inline checkout widget (FlutterwaveCheckout) reports
      // success as "completed" — NOT "successful". "successful" is what the
      // newer Standard/redirect flow uses. Accept both so a real successful
      // payment doesn't get treated as failed.
      if (response.status === "successful" || response.status === "completed") {
        console.log(
          `[purchase] Status ${response.status} — finalizing immediately`,
        );
        await finalizePurchase(response, quiz.id);
        return;
      }

      if (response.status === "pending") {
        console.log(
          "[purchase] Status pending (typical for bank transfer) — polling for confirmation",
        );
        confirmBtn.textContent = "Confirming payment...";
        await pollForConfirmation(response, quiz.id);
        return;
      }

      // Anything else (e.g. "cancelled") is a genuine failure.
      console.log(
        "[purchase] Status not successful/pending — treating as failed",
        response.status,
      );
      isPurchasing = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Purchase";
      alert("Payment was not completed.");
    },
    onclose: () => {
      console.log("[purchase] Flutterwave modal closed by user");
      // User closed the Flutterwave modal without paying.
      isPurchasing = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Purchase";
    },
  });
}

/**
 * Verifies + finalizes a purchase that Flutterwave has already reported
 * as successful (used both for the immediate card-payment path and for
 * the tail end of the bank-transfer polling path once it succeeds).
 */
async function finalizePurchase(response, quizId) {
  console.log("[purchase] Calling confirmFlutterwavePurchase()", {
    quizId,
    txRef: response.tx_ref,
    transactionId: response.transaction_id,
  });

  const result = await confirmFlutterwavePurchase(
    currentUserId,
    quizId,
    response.tx_ref,
    response.transaction_id,
  );

  console.log("[purchase] confirmFlutterwavePurchase() result", result);

  isPurchasing = false;

  const confirmBtn = document.getElementById("confirmPurchaseBtn");

  if (!result.success) {
    console.warn("[purchase] Verification failed", result.message);
    alert(
      result.message || "Payment verification failed. Please contact support.",
    );
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Purchase";
    }
    return;
  }

  console.log(
    "[purchase] Verified + recorded successfully. Refreshing user data.",
  );

  // Pull the freshly-written user document (purchasedQuizzes now
  // includes the new purchase) instead of trusting local state.
  const freshUserData = await getUserData(currentUserId);
  if (freshUserData) {
    currentUserData = freshUserData;
  }

  closePurchaseDialog();

  // Full re-render, sourced from Firestore: rebuilds the quiz grid
  // (so this card flips to "Owned"), re-registers the back handler
  // with the updated currentUserData, and keeps everything as an
  // SPA update — no location.reload() anywhere. Calls the internal
  // render function directly (not the exported renderMarketplace)
  // so this refresh doesn't push a second, phantom history entry —
  // the student hasn't navigated anywhere, they're still on
  // Marketplace, just looking at updated data.
  await renderMarketplacePage(currentUserData);
}

/**
 * Polls confirmFlutterwavePurchase() a handful of times for a bank
 * transfer that Flutterwave reported as "pending" in the checkout
 * callback. The Cloud Function itself re-checks the real status with
 * Flutterwave's servers each time, so this is just "keep asking until
 * either it's confirmed or we give up and tell the user to check back."
 */
async function pollForConfirmation(response, quizId, attempt = 1) {
  const maxAttempts = 6; // ~30s total at a 5s interval
  const intervalMs = 5000;

  console.log(`[purchase] Polling attempt ${attempt}/${maxAttempts}`, {
    quizId,
    txRef: response.tx_ref,
  });

  const stopLoading = showLoadingOverlay(
    document.getElementById("purchaseDialogBox"),
    [
      "Confirming your bank transfer...",
      "This can take a moment...",
      "Almost there...",
    ],
    { subtitle: "Please don't close this window" },
  );

  let result;
  try {
    result = await confirmFlutterwavePurchase(
      currentUserId,
      quizId,
      response.tx_ref,
      response.transaction_id,
    );
  } finally {
    stopLoading();
  }

  console.log(`[purchase] Poll attempt ${attempt} result`, result);

  if (result.success) {
    console.log("[purchase] Confirmed during polling. Finalizing.");
    isPurchasing = false;

    const freshUserData = await getUserData(currentUserId);
    if (freshUserData) {
      currentUserData = freshUserData;
    }

    closePurchaseDialog();
    await renderMarketplacePage(currentUserData);
    return;
  }

  if (attempt >= maxAttempts) {
    console.warn(
      "[purchase] Gave up polling after max attempts",
      result.message,
    );
    isPurchasing = false;
    const confirmBtn = document.getElementById("confirmPurchaseBtn");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Purchase";
    }
    alert(
      "We're still confirming your bank transfer. This can take a few minutes — please check back on the Marketplace shortly, or contact support with your reference if this persists.",
    );
    return;
  }

  setTimeout(
    () => pollForConfirmation(response, quizId, attempt + 1),
    intervalMs,
  );
}
