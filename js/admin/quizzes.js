import { db } from "../firebase/config.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   MODULE STATE
   - quizzesCache avoids refetching a single quiz just to
     populate the edit form.
   - editingQuizId tracks whether the form is in
     "create" mode (null) or "edit" mode (quiz id).
   - currentContainer is the DOM node this module is currently
     rendering into. Every DOM read/write below goes through
     currentContainer.querySelector(...) instead of the global
     document.getElementById(...).

     Why: renderQuizzes() awaits network calls (loadSubjects,
     loadQuizzes) before touching the DOM again. If the admin
     switches tabs while one of those awaits is in flight,
     dashboard.js's renderAdminDashboard() replaces the *entire*
     app.innerHTML, including a brand-new #adminContent — the
     old container node (and everything inside it) is detached
     from the live document. A global document.getElementById()
     call made after that point searches the live document, finds
     nothing, and returns null — which is what caused
     "Cannot read properties of null (reading 'addEventListener')".

     Querying the captured container instead always finds the
     elements that were actually rendered by *this* call, whether
     or not that subtree is still attached to the page. Writing
     into a detached subtree is harmless (just wasted, invisible
     work) instead of a crash.
========================================================= */
let quizzesCache = [];
let editingQuizId = null;
let currentContainer = null;

/* =========================================================
   PUBLIC ENTRY POINT
========================================================= */
export async function renderQuizzes(container) {
  currentContainer = container;

  container.innerHTML = `
    <div class="admin-card">
      <div class="quizzes-header">
        <h2>Quizzes</h2>
        <p class="quizzes-subtitle">Create, edit and manage your quizzes</p>
      </div>

      <form id="quizForm" class="quiz-form">
        <div class="quiz-form-grid">
          <div class="form-field">
            <label for="subjectSelect">Subject</label>
            <select id="subjectSelect">
              <option value="">Select Subject</option>
            </select>
          </div>

          <div class="form-field">
            <label for="weekInput">Week</label>
            <input id="weekInput" type="number" min="1" placeholder="e.g. 3" />
          </div>

          <div class="form-field form-field-wide">
            <label for="titleInput">Quiz Topic</label>
            <input id="titleInput" placeholder="e.g. Magnetic Force" />
          </div>

          <div class="form-field">
            <label for="priceInput">Price (₦)</label>
            <input id="priceInput" type="number" min="0" placeholder="e.g. 500" />
          </div>
        </div>

        <div class="quiz-form-actions">
          <button type="submit" id="submitQuizBtn" class="btn-primary">
            Create Quiz
          </button>
          <button type="button" id="cancelEditBtn" class="btn-secondary" hidden>
            Cancel Edit
          </button>
        </div>
      </form>

      <div id="quizList" class="quiz-list-wrapper">
        <p>Loading...</p>
      </div>
    </div>
  `;

  await loadSubjects();
  await loadQuizzes();

  // Bail if a later renderQuizzes()/tab switch has already moved on.
  // (loadSubjects/loadQuizzes below guard their own writes the same
  // way, but the listeners below are the specific ones that crashed.)
  if (currentContainer !== container || !container.isConnected) return;

  container
    .querySelector("#quizForm")
    ?.addEventListener("submit", handleFormSubmit);
  container
    .querySelector("#cancelEditBtn")
    ?.addEventListener("click", exitEditMode);
}

/* =========================================================
   SUBJECTS
========================================================= */
async function loadSubjects() {
  const container = currentContainer;
  const snapshot = await getDocs(collection(db, "subjects"));

  // Container moved on (different tab, or renderQuizzes called again)
  // while this fetch was in flight — nothing left to safely update.
  if (currentContainer !== container) return;

  const select = container.querySelector("#subjectSelect");
  if (!select) return;

  // Clear old options (important if this page is rendered again)
  select.innerHTML = `<option value="">Select Subject</option>`;

  snapshot.forEach((docSnap) => {
    const subject = docSnap.data();

    const option = document.createElement("option");

    option.value = docSnap.id;

    // Store the actual values
    option.dataset.name = subject.name;
    option.dataset.level = subject.level;
    option.dataset.semester = subject.semester;

    const semesterLabel =
      subject.semester === 1
        ? "First Semester"
        : subject.semester === 2
          ? "Second Semester"
          : `Semester ${subject.semester}`;

    option.textContent = `${subject.name} • ${subject.level} Level • ${semesterLabel}`;

    select.appendChild(option);
  });
}
/* =========================================================
   FORM HELPERS
========================================================= */
function getFormValues() {
  const subjectSelect = currentContainer.querySelector("#subjectSelect");
  const selectedOption = subjectSelect.options[subjectSelect.selectedIndex];

  return {
    subjectId: subjectSelect.value,
    subjectName: selectedOption.dataset.name,

    level: Number(selectedOption.dataset.level),
    semester: Number(selectedOption.dataset.semester),

    week: currentContainer.querySelector("#weekInput").value,
    title: currentContainer.querySelector("#titleInput").value.trim(),
    price: currentContainer.querySelector("#priceInput").value,
  };
}

function validateForm(values) {
  if (!values.subjectId) {
    alert("Please select a subject.");
    return false;
  }
  if (!values.week) {
    alert("Please enter the week number.");
    return false;
  }
  if (!values.title) {
    alert("Please enter a quiz title.");
    return false;
  }
  if (values.price === "" || values.price === null) {
    alert("Please enter a price.");
    return false;
  }
  return true;
}

function resetForm() {
  currentContainer.querySelector("#quizForm")?.reset();
}

function enterEditMode(quiz, id) {
  editingQuizId = id;

  const container = currentContainer;

  const subjectSelect = container.querySelector("#subjectSelect");
  if (subjectSelect) subjectSelect.value = quiz.subjectId;

  const weekInput = container.querySelector("#weekInput");
  if (weekInput) weekInput.value = quiz.week;

  const titleInput = container.querySelector("#titleInput");
  if (titleInput) titleInput.value = quiz.title;

  const priceInput = container.querySelector("#priceInput");
  if (priceInput) priceInput.value = quiz.price;

  const submitBtn = container.querySelector("#submitQuizBtn");
  if (submitBtn) submitBtn.textContent = "Save Changes";

  const cancelBtn = container.querySelector("#cancelEditBtn");
  if (cancelBtn) cancelBtn.hidden = false;

  container
    .querySelector("#quizForm")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitEditMode() {
  editingQuizId = null;
  resetForm();

  const container = currentContainer;
  const submitBtn = container?.querySelector("#submitQuizBtn");
  if (submitBtn) submitBtn.textContent = "Create Quiz";

  const cancelBtn = container?.querySelector("#cancelEditBtn");
  if (cancelBtn) cancelBtn.hidden = true;
}

/* =========================================================
   CREATE / UPDATE (single form, two modes)
========================================================= */
async function handleFormSubmit(e) {
  e.preventDefault();

  const container = currentContainer;
  const values = getFormValues();
  if (!validateForm(values)) return;

  if (editingQuizId) {
    await updateQuiz(editingQuizId, values);
  } else {
    await createQuiz(values);
  }

  // Tab changed while the write was in flight — don't touch a form
  // that's no longer on screen.
  if (currentContainer !== container || !container.isConnected) return;

  exitEditMode();
  await loadQuizzes();
}

async function createQuiz(values) {
  await addDoc(collection(db, "quizzes"), {
    subjectId: values.subjectId,
    subjectName: values.subjectName,

    level: values.level,
    semester: values.semester,

    week: Number(values.week),
    title: values.title,
    price: Number(values.price),

    active: true,
    createdAt: serverTimestamp(),
  });
}

async function updateQuiz(id, values) {
  await updateDoc(doc(db, "quizzes", id), {
    subjectId: values.subjectId,
    subjectName: values.subjectName,

    level: values.level,
    semester: values.semester,

    week: Number(values.week),
    title: values.title,
    price: Number(values.price),
  });
}

/* =========================================================
   LOAD + RENDER QUIZ LIST
========================================================= */
async function loadQuizzes() {
  const container = currentContainer;
  const snapshot = await getDocs(collection(db, "quizzes"));

  if (currentContainer !== container) return;

  const list = container.querySelector("#quizList");
  if (!list) return;

  quizzesCache = [];
  snapshot.forEach((docSnap) => {
    quizzesCache.push({ id: docSnap.id, ...docSnap.data() });
  });

  if (quizzesCache.length === 0) {
    list.innerHTML = renderEmptyState();
    return;
  }

  list.innerHTML = `
    <div class="quiz-grid">
      ${quizzesCache.map(renderQuizCard).join("")}
    </div>
  `;

  attachQuizListEvents(list);
}

function renderEmptyState() {
  return `
    <div class="quiz-empty-state">
      <p>No quizzes created yet</p>
    </div>
  `;
}

function renderQuizCard(quiz) {
  const statusClass = quiz.active ? "badge-active" : "badge-inactive";
  const statusLabel = quiz.active ? "Active" : "Inactive";

  return `
    <div class="quiz-card" data-id="${quiz.id}">
      <div class="quiz-card-top">
        <span class="badge badge-subject">${quiz.subjectName}</span>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>

      <h3 class="quiz-card-title">${quiz.title}</h3>
      <p class="quiz-card-week">Week ${quiz.week}</p>

      <div class="quiz-card-footer">
        <span class="badge badge-price">₦${quiz.price}</span>

        <div class="quiz-card-actions">
          <button class="btn-edit" data-action="edit" data-id="${quiz.id}">
            Edit
          </button>
          <button class="btn-delete" data-action="delete" data-id="${quiz.id}">
            Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   EVENT DELEGATION
   Centralized here so future actions (publish, duplicate,
   manage questions, analytics) only need a new "case" below
   plus a new button in renderQuizCard — no rewiring needed.
========================================================= */
function attachQuizListEvents(list) {
  list.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      handleQuizAction(action, id);
    });
  });
}

function handleQuizAction(action, id) {
  switch (action) {
    case "edit":
      handleEditClick(id);
      break;
    case "delete":
      handleDeleteClick(id);
      break;
    // Future actions plug in here, e.g.:
    // case "publish": handlePublishClick(id); break;
    // case "duplicate": handleDuplicateClick(id); break;
    // case "manage-questions": handleManageQuestionsClick(id); break;
    // case "analytics": handleAnalyticsClick(id); break;
    default:
      console.warn(`Unhandled quiz action: ${action}`);
  }
}

function handleEditClick(id) {
  const quiz = quizzesCache.find((q) => q.id === id);
  if (!quiz) return;
  enterEditMode(quiz, id);
}

async function handleDeleteClick(id) {
  if (!confirm("Delete this quiz?")) return;

  const container = currentContainer;

  await deleteDoc(doc(db, "quizzes", id));

  if (currentContainer !== container || !container.isConnected) return;

  if (editingQuizId === id) {
    exitEditMode();
  }

  await loadQuizzes();
}
