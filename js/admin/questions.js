import { db } from "../firebase/config.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  CLOUDINARY_UPLOAD_URL,
  CLOUDINARY_UPLOAD_PRESET,
} from "../cloudinary/config.js";

/* =========================================================
   MODULE STATE
   subjectsCache / quizzesCache are loaded once and reused
   everywhere (dropdowns, card labels, search) to avoid
   refetching Firestore on every interaction.
========================================================= */
let subjectsCache = [];
let quizzesCache = [];
let questionsCache = [];

let currentSubjectId = "";
let currentQuizId = "";
let editingQuestionId = null;
let searchTerm = "";

// Image state for the create/edit form. Kept separate from
// getFormValues() because resolving the final image URL is
// async (may involve an upload) while the rest of the form
// isn't.
let selectedImageFile = null; // a File the user just picked, or null
let existingImageUrl = ""; // the image already saved on the question being edited
let removeImageFlag = false; // true if editing and the user chose to remove the image

/* =========================================================
   PUBLIC ENTRY POINT
========================================================= */
export async function renderQuestions(container) {
  container.innerHTML = `
    <div class="admin-card">
      <div class="questions-header">
        <h2>Questions</h2>
        <p class="questions-subtitle">Add, edit and manage quiz questions</p>
      </div>

      <!-- Quiz context: drives the form, list, import and export below -->
      <div class="context-card">
        <div class="form-field">
          <label for="subjectFilterSelect">Subject</label>
          <select id="subjectFilterSelect">
            <option value="">Select Subject</option>
          </select>
        </div>

        <div class="form-field">
          <label for="quizFilterSelect">Quiz</label>
          <select id="quizFilterSelect" disabled>
            <option value="">Select Quiz</option>
          </select>
        </div>
      </div>

      <!-- Add / Edit question -->
      <form id="questionForm" class="question-form">
        <div class="form-field">
          <label for="questionInput">Question</label>
          <textarea id="questionInput" placeholder="Enter Question"></textarea>
        </div>

        <div class="options-grid">
          <div class="form-field">
            <label for="optionA">Option A</label>
            <input id="optionA" placeholder="Option A" />
          </div>
          <div class="form-field">
            <label for="optionB">Option B</label>
            <input id="optionB" placeholder="Option B" />
          </div>
          <div class="form-field">
            <label for="optionC">Option C</label>
            <input id="optionC" placeholder="Option C" />
          </div>
          <div class="form-field">
            <label for="optionD">Option D</label>
            <input id="optionD" placeholder="Option D" />
          </div>
        </div>

        <div class="form-field">
          <label for="answerSelect">Correct Answer</label>
          <select id="answerSelect">
            <option value="">Correct Answer</option>
            <option value="0">Option A</option>
            <option value="1">Option B</option>
            <option value="2">Option C</option>
            <option value="3">Option D</option>
          </select>
        </div>

        <div class="form-field">
          <label for="questionImageInput">Question Image (optional)</label>
          <input type="file" id="questionImageInput" accept="image/*" />

          <div id="imagePreviewWrapper" class="image-preview-wrapper" hidden>
            <img id="imagePreview" class="image-preview" alt="Question image preview" />
            <button type="button" id="removeImageBtn" class="btn-remove-image">
              Remove Image
            </button>
          </div>
        </div>

        <div id="formStatus" class="form-status" hidden></div>

        <div class="question-form-actions">
          <button type="submit" id="saveQuestionBtn" class="btn-primary">
            Add Question
          </button>
          <button type="button" id="cancelEditBtn" class="btn-secondary" hidden>
            Cancel
          </button>
        </div>
      </form>

      <!-- JSON import -->
      <div class="import-card">
        <h3>Import Questions</h3>
        <p class="import-hint">
          Upload a JSON file of questions. They will be attached to the Subject
          and Quiz selected above.
        </p>
        <div class="import-controls">
          <input type="file" id="importFileInput" accept="application/json" />
          <button type="button" id="importBtn" class="btn-secondary">Import</button>
        </div>
        <div id="importResult" class="import-result"></div>
      </div>

      <!-- Search + counter + export -->
      <div class="list-toolbar">
        <input
          type="text"
          id="searchInput"
          class="search-input"
          placeholder="Search by question, subject or quiz title..."
        />
        <div class="list-toolbar-right">
          <span id="questionCounter" class="question-counter">Showing 0 Questions</span>
          <button type="button" id="exportBtn" class="btn-secondary">Export</button>
        </div>
      </div>

      <div id="questionList" class="question-list-wrapper">
        <p>Loading...</p>
      </div>
    </div>
  `;

  await loadInitialData();
  attachStaticEventListeners();
}

/* =========================================================
   INITIAL DATA
========================================================= */
async function loadInitialData() {
  await Promise.all([loadSubjects(), loadAllQuizzes()]);
  renderQuestionList();
}

async function loadSubjects() {
  const select = document.getElementById("subjectFilterSelect");
  const snapshot = await getDocs(collection(db, "subjects"));

  subjectsCache = [];
  snapshot.forEach((docSnap) => {
    subjectsCache.push({ id: docSnap.id, ...docSnap.data() });
  });

  subjectsCache.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.name;
    select.appendChild(option);
  });
}

async function loadAllQuizzes() {
  const snapshot = await getDocs(collection(db, "quizzes"));

  quizzesCache = [];
  snapshot.forEach((docSnap) => {
    quizzesCache.push({ id: docSnap.id, ...docSnap.data() });
  });
}

/* =========================================================
   STATIC EVENT LISTENERS
========================================================= */
function attachStaticEventListeners() {
  document
    .getElementById("subjectFilterSelect")
    .addEventListener("change", handleSubjectChange);

  document
    .getElementById("quizFilterSelect")
    .addEventListener("change", handleQuizChange);

  document
    .getElementById("questionForm")
    .addEventListener("submit", handleFormSubmit);

  document
    .getElementById("cancelEditBtn")
    .addEventListener("click", exitEditMode);

  document
    .getElementById("questionImageInput")
    .addEventListener("change", handleImageFileSelected);

  document
    .getElementById("removeImageBtn")
    .addEventListener("click", handleRemoveImageClick);

  document
    .getElementById("importBtn")
    .addEventListener("click", handleImportClick);

  document
    .getElementById("exportBtn")
    .addEventListener("click", handleExportClick);

  document
    .getElementById("searchInput")
    .addEventListener("input", handleSearchInput);
}

/* =========================================================
   SUBJECT / QUIZ CONTEXT
========================================================= */
function handleSubjectChange(e) {
  currentSubjectId = e.target.value;
  currentQuizId = "";
  questionsCache = [];

  populateQuizSelect(currentSubjectId);
  exitEditMode();
  renderQuestionList();
}

function populateQuizSelect(subjectId) {
  const quizSelect = document.getElementById("quizFilterSelect");
  quizSelect.innerHTML = '<option value="">Select Quiz</option>';

  if (!subjectId) {
    quizSelect.disabled = true;
    return;
  }

  const matchingQuizzes = quizzesCache.filter((q) => q.subjectId === subjectId);

  matchingQuizzes.forEach((quiz) => {
    const option = document.createElement("option");
    option.value = quiz.id;
    option.textContent = `Week ${quiz.week} - ${quiz.title}`;
    quizSelect.appendChild(option);
  });

  quizSelect.disabled = false;
}

async function handleQuizChange(e) {
  currentQuizId = e.target.value;
  exitEditMode();

  if (!currentQuizId) {
    questionsCache = [];
    renderQuestionList();
    return;
  }

  await loadQuestionsForQuiz(currentQuizId);
  renderQuestionList();
}

async function loadQuestionsForQuiz(quizId) {
  const list = document.getElementById("questionList");
  if (list) {
    list.innerHTML = "<p>Loading...</p>";
  }

  const q = query(collection(db, "questions"), where("quizId", "==", quizId));
  const snapshot = await getDocs(q);

  questionsCache = [];
  snapshot.forEach((docSnap) => {
    questionsCache.push({ id: docSnap.id, ...docSnap.data() });
  });
}

/* =========================================================
   FORM HELPERS
========================================================= */
function getFormValues() {
  return {
    question: document.getElementById("questionInput").value.trim(),
    options: [
      document.getElementById("optionA").value.trim(),
      document.getElementById("optionB").value.trim(),
      document.getElementById("optionC").value.trim(),
      document.getElementById("optionD").value.trim(),
    ],
    answer: document.getElementById("answerSelect").value,
  };
}

function validateForm(values) {
  if (!currentQuizId) {
    alert("Please select a Subject and Quiz first.");
    return false;
  }
  if (!values.question) {
    alert("Please enter the question text.");
    return false;
  }
  if (values.options.some((opt) => !opt)) {
    alert("Please fill in all four options.");
    return false;
  }
  if (values.answer === "") {
    alert("Please select the correct answer.");
    return false;
  }
  return true;
}

function resetForm() {
  document.getElementById("questionForm").reset();
  resetImageState();
}

function enterEditMode(question) {
  editingQuestionId = question.id;

  document.getElementById("questionInput").value = question.question;
  document.getElementById("optionA").value = question.options[0];
  document.getElementById("optionB").value = question.options[1];
  document.getElementById("optionC").value = question.options[2];
  document.getElementById("optionD").value = question.options[3];
  document.getElementById("answerSelect").value = question.answer;

  resetImageState();
  existingImageUrl = question.image || "";
  if (existingImageUrl) {
    showImagePreview(existingImageUrl);
  }

  document.getElementById("saveQuestionBtn").textContent = "Update Question";
  document.getElementById("cancelEditBtn").hidden = false;

  document
    .getElementById("questionForm")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitEditMode() {
  editingQuestionId = null;
  resetForm();

  document.getElementById("saveQuestionBtn").textContent = "Add Question";
  document.getElementById("cancelEditBtn").hidden = true;
}

/* =========================================================
   IMAGE HANDLING (create + edit)
========================================================= */
function handleImageFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  selectedImageFile = file;
  removeImageFlag = false;

  const previewUrl = URL.createObjectURL(file);
  showImagePreview(previewUrl);
}

function handleRemoveImageClick() {
  selectedImageFile = null;
  removeImageFlag = true;
  existingImageUrl = "";

  document.getElementById("questionImageInput").value = "";
  hideImagePreview();
}

function showImagePreview(url) {
  const wrapper = document.getElementById("imagePreviewWrapper");
  const img = document.getElementById("imagePreview");

  img.src = url;
  wrapper.hidden = false;
}

function hideImagePreview() {
  const wrapper = document.getElementById("imagePreviewWrapper");
  const img = document.getElementById("imagePreview");

  img.src = "";
  wrapper.hidden = true;
}

function resetImageState() {
  selectedImageFile = null;
  existingImageUrl = "";
  removeImageFlag = false;
  hideImagePreview();
}

/**
 * Resolves what the question's `image` field should be saved as:
 * - a newly picked file gets uploaded and returns its download URL
 * - an explicit "Remove Image" click returns ""
 * - editing with no change keeps the existing image URL
 * - a brand new question with no image picked returns ""
 */
async function resolveImageUrl() {
  if (selectedImageFile) {
    return uploadQuestionImage(selectedImageFile);
  }

  if (removeImageFlag) {
    return "";
  }

  if (editingQuestionId) {
    return existingImageUrl;
  }

  return "";
}

/**
 * Uploads a file to Cloudinary using an unsigned upload preset
 * (see cloudinary/config.js). Throws on failure — resolveImageUrl()
 * is always awaited before any Firestore write, so a thrown error
 * here propagates up to handleFormSubmit()'s try/catch and the
 * question document is never saved if the upload fails.
 */
async function uploadQuestionImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Image upload to Cloudinary failed.");
  }

  const data = await response.json();
  return data.secure_url;
}

/* =========================================================
   FORM STATUS MESSAGE (upload/save progress + errors)
========================================================= */
function showFormStatus(message, type = "info") {
  const statusEl = document.getElementById("formStatus");
  statusEl.textContent = message;
  statusEl.className = `form-status status-${type}`;
  statusEl.hidden = false;
}

function clearFormStatus() {
  const statusEl = document.getElementById("formStatus");
  statusEl.textContent = "";
  statusEl.hidden = true;
}

/* =========================================================
   CREATE / UPDATE
========================================================= */
async function handleFormSubmit(e) {
  e.preventDefault();

  const values = getFormValues();
  if (!validateForm(values)) return;

  const saveBtn = document.getElementById("saveQuestionBtn");
  const originalLabel = saveBtn.textContent;
  const isUploadingNewImage = Boolean(selectedImageFile);

  saveBtn.disabled = true;
  clearFormStatus();

  // --- Step 1: resolve the image (may involve a Cloudinary upload) ---
  let imageUrl;
  try {
    if (isUploadingNewImage) {
      saveBtn.textContent = "Uploading image...";
      showFormStatus("Uploading image...", "info");
    }

    imageUrl = await resolveImageUrl();
  } catch (err) {
    console.error("Image upload failed:", err);
    showFormStatus(
      "Image upload failed. Please check your connection and try again.",
      "error",
    );
    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
    return; // Firestore is never touched if the upload failed
  }

  // --- Step 2: save the question document ---
  try {
    saveBtn.textContent = "Saving...";
    if (isUploadingNewImage) {
      showFormStatus("Image uploaded. Saving question...", "info");
    }

    if (editingQuestionId) {
      await updateQuestion(editingQuestionId, values, imageUrl);
    } else {
      await createQuestion(values, imageUrl);
    }

    showFormStatus("Question saved successfully!", "success");
    setTimeout(clearFormStatus, 3000);

    exitEditMode();
    await loadQuestionsForQuiz(currentQuizId);
    renderQuestionList();
  } catch (err) {
    console.error("Failed to save question:", err);
    showFormStatus("Failed to save the question. Please try again.", "error");
    saveBtn.textContent = originalLabel;
  } finally {
    saveBtn.disabled = false;
  }
}

function getCurrentSubjectName() {
  const subject = subjectsCache.find((s) => s.id === currentSubjectId);
  return subject ? subject.name : "";
}

async function createQuestion(values, imageUrl) {
  await addDoc(collection(db, "questions"), {
    quizId: currentQuizId,
    subjectId: currentSubjectId,
    subjectName: getCurrentSubjectName(),
    question: values.question,
    image: imageUrl || "",
    options: values.options,
    answer: Number(values.answer),
    createdAt: serverTimestamp(),
  });
}

async function updateQuestion(id, values, imageUrl) {
  await updateDoc(doc(db, "questions", id), {
    question: values.question,
    image: imageUrl || "",
    options: values.options,
    answer: Number(values.answer),
  });
}

/* =========================================================
   RENDER QUESTION LIST
========================================================= */
function getFilteredQuestions() {
  if (!searchTerm) return questionsCache;

  const term = searchTerm.toLowerCase();

  return questionsCache.filter((q) => {
    const quiz = getQuizById(q.quizId);
    const haystack = [q.question, q.subjectName, quiz ? quiz.title : ""]
      .join(" ")
      .toLowerCase();

    return haystack.includes(term);
  });
}

function getQuizById(quizId) {
  return quizzesCache.find((q) => q.id === quizId);
}

function renderQuestionList() {
  const list = document.getElementById("questionList");
  const counter = document.getElementById("questionCounter");

  // If the admin switched to a different tab (or a different quiz
  // context) while a prior async load was still in flight, these
  // elements may no longer exist in the current DOM. Bail out
  // instead of writing into null.
  if (!list || !counter) return;

  if (!currentQuizId) {
    list.innerHTML = renderEmptyState(
      "Select a Subject and Quiz to see questions.",
    );
    counter.textContent = "Showing 0 Questions";
    return;
  }

  const filtered = getFilteredQuestions();
  counter.textContent = `Showing ${filtered.length} Question${filtered.length === 1 ? "" : "s"}`;

  if (filtered.length === 0) {
    list.innerHTML = renderEmptyState("No questions yet.");
    return;
  }

  list.innerHTML = `
    <div class="question-grid">
      ${filtered.map(renderQuestionCard).join("")}
    </div>
  `;

  attachQuestionListEvents(list);
}

function renderEmptyState(message) {
  return `
    <div class="question-empty-state">
      <p>${message}</p>
    </div>
  `;
}

function renderQuestionCard(q) {
  const quiz = getQuizById(q.quizId);
  const weekLabel = quiz ? `Week ${quiz.week}` : "";
  const quizTitle = quiz ? quiz.title : "Unknown Quiz";
  const letters = ["A", "B", "C", "D"];

  const optionsHtml = q.options
    .map((opt, index) => {
      const isCorrect = index === q.answer;
      return `
        <div class="question-option ${isCorrect ? "option-correct" : ""}">
          <span class="option-letter">${letters[index]}</span>
          <span class="option-text">${opt}</span>
          ${isCorrect ? '<span class="badge badge-correct">Correct</span>' : ""}
        </div>
      `;
    })
    .join("");

  const imageHtml = q.image
    ? `<img class="question-card-image" src="${q.image}" alt="Question image" />`
    : "";

  return `
    <div class="question-card" data-id="${q.id}">
      <div class="question-card-top">
        <span class="badge badge-subject">${q.subjectName}</span>
        <span class="badge badge-quiz">${weekLabel} · ${quizTitle}</span>
      </div>

      <p class="question-card-text">${q.question}</p>

      ${imageHtml}

      <div class="question-options-list">
        ${optionsHtml}
      </div>

      <div class="question-card-actions">
        <button class="btn-edit" data-action="edit" data-id="${q.id}">Edit</button>
        <button class="btn-delete" data-action="delete" data-id="${q.id}">Delete</button>
      </div>
    </div>
  `;
}

/* =========================================================
   EVENT DELEGATION FOR CARD ACTIONS
   Future actions (duplicate, bulk delete, etc.) only need a
   new "case" here plus a new button in renderQuestionCard.
========================================================= */
function attachQuestionListEvents(list) {
  list.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleQuestionAction(btn.dataset.action, btn.dataset.id);
    });
  });
}

function handleQuestionAction(action, id) {
  switch (action) {
    case "edit":
      handleEditClick(id);
      break;
    case "delete":
      handleDeleteClick(id);
      break;
    // Future actions plug in here, e.g.:
    // case "duplicate": handleDuplicateClick(id); break;
    // case "bulk-delete": handleBulkDeleteClick(id); break;
    default:
      console.warn(`Unhandled question action: ${action}`);
  }
}

function handleEditClick(id) {
  const question = questionsCache.find((q) => q.id === id);
  if (!question) return;
  enterEditMode(question);
}

async function handleDeleteClick(id) {
  if (!confirm("Delete this question?")) return;

  await deleteDoc(doc(db, "questions", id));

  if (editingQuestionId === id) {
    exitEditMode();
  }

  await loadQuestionsForQuiz(currentQuizId);
  renderQuestionList();
}

/* =========================================================
   SEARCH
========================================================= */
function handleSearchInput(e) {
  searchTerm = e.target.value.trim();
  renderQuestionList();
}

/* =========================================================
   JSON IMPORT
   Note: bulk-imported questions are not expected to include
   images (there's no per-item upload step in a JSON import).
   The `image` field is still written as "" so every question
   document has a consistent shape.
========================================================= */
async function handleImportClick() {
  if (!currentQuizId) {
    alert("Please select a Subject and Quiz before importing.");
    return;
  }

  const fileInput = document.getElementById("importFileInput");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please choose a JSON file to import.");
    return;
  }

  const resultBox = document.getElementById("importResult");
  resultBox.textContent = "Importing...";

  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);

    if (!Array.isArray(parsed)) {
      resultBox.textContent =
        "Import failed: JSON must be an array of questions.";
      return;
    }

    const { valid, invalidCount } = validateImportedQuestions(parsed);
    const { successCount, failedCount } = await saveImportedQuestions(valid);

    resultBox.textContent =
      `Imported ${successCount} question(s). ` +
      `Skipped ${invalidCount} invalid. ` +
      `Failed ${failedCount} upload(s).`;

    fileInput.value = "";
    await loadQuestionsForQuiz(currentQuizId);
    renderQuestionList();
  } catch (err) {
    console.error(err);
    resultBox.textContent = "Import failed: could not read or parse the file.";
  }
}

function validateImportedQuestions(items) {
  const valid = [];
  let invalidCount = 0;

  items.forEach((item) => {
    const isValid =
      item &&
      typeof item.question === "string" &&
      item.question.trim() !== "" &&
      Array.isArray(item.options) &&
      item.options.length === 4 &&
      item.options.every(
        (opt) => typeof opt === "string" && opt.trim() !== "",
      ) &&
      Number.isInteger(item.answer) &&
      item.answer >= 0 &&
      item.answer <= 3;

    if (isValid) {
      valid.push(item);
    } else {
      invalidCount++;
    }
  });

  return { valid, invalidCount };
}

async function saveImportedQuestions(items) {
  let successCount = 0;
  let failedCount = 0;

  for (const item of items) {
    try {
      await addDoc(collection(db, "questions"), {
        quizId: currentQuizId,
        subjectId: currentSubjectId,
        subjectName: getCurrentSubjectName(),
        question: item.question.trim(),
        image: typeof item.image === "string" ? item.image : "",
        options: item.options.map((opt) => opt.trim()),
        answer: Number(item.answer),
        createdAt: serverTimestamp(),
      });
      successCount++;
    } catch (err) {
      console.error("Failed to import question:", err);
      failedCount++;
    }
  }

  return { successCount, failedCount };
}

/* =========================================================
   JSON EXPORT
========================================================= */
function handleExportClick() {
  if (!currentQuizId) {
    alert("Please select a Subject and Quiz to export.");
    return;
  }

  if (questionsCache.length === 0) {
    alert("There are no questions to export for this quiz.");
    return;
  }

  const exportData = questionsCache.map((q) => ({
    question: q.question,
    image: q.image || "",
    options: q.options,
    answer: q.answer,
  }));

  const quiz = getQuizById(currentQuizId);
  const filename = quiz ? `${quiz.title}-questions.json` : "questions.json";

  downloadJson(exportData, filename);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
