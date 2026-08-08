import { db } from "../firebase/config.js";

import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   MODULE STATE
   currentContainer mirrors the pattern used in quizzes.js: every
   DOM read/write goes through currentContainer.querySelector(...)
   instead of the global document.getElementById(...), and every
   post-await write is guarded against the admin having switched
   tabs while the fetch was in flight. See quizzes.js for the full
   writeup of why (short version: a stale document.getElementById()
   call after an await can return null and crash — the exact
   failure this file had in loadSubjects()).
========================================================= */
let currentContainer = null;

export async function renderSubjects(container) {
  currentContainer = container;

  container.innerHTML = `
    <div class="admin-card">

      <div class="subject-create-section">
        <h2>Add a New Subject</h2>
        <p class="subjects-subtitle">
          Enter a name, level and semester, then press "Add Subject" to save it.
        </p>

        <div class="subject-form-grid">
          <div class="subject-form-field subject-form-field-wide">
            <label for="subjectName">Subject Name</label>
            <input
              id="subjectName"
              type="text"
              placeholder="e.g. MTH 121"
            />
          </div>

          <div class="subject-form-field">
            <label for="subjectLevel">Level</label>
            <select id="subjectLevel">
              <option value="100" selected>100 Level</option>
              <option value="200">200 Level</option>
              <option value="300">300 Level</option>
              <option value="400">400 Level</option>
              <option value="500">500 Level</option>
            </select>
          </div>

          <div class="subject-form-field">
            <label for="subjectSemester">Semester</label>
            <select id="subjectSemester">
              <option value="1">First Semester</option>
              <option value="2" selected>Second Semester</option>
            </select>
          </div>
        </div>

        <div class="subject-form-actions">
          <button id="addSubjectBtn" class="subject-add-btn">
            + Add Subject
          </button>
        </div>
      </div>

      <div class="page-header subjects-header">
        <div>
          <h2>All Subjects</h2>
          <p class="subjects-subtitle">Manage the subjects available for quizzes.</p>
        </div>

        <div class="count-badge" id="subjectCount">
          0 Subjects
        </div>
      </div>

      <div id="subjectsList">
        Loading...
      </div>

    </div>
  `;

  container
    .querySelector("#addSubjectBtn")
    ?.addEventListener("click", addSubject);

  await loadSubjects();
}

async function addSubject() {
  const container = currentContainer;

  const nameInput = container.querySelector("#subjectName");
  const levelInput = container.querySelector("#subjectLevel");
  const semesterInput = container.querySelector("#subjectSemester");

  const name = nameInput.value.trim();
  const level = Number(levelInput.value);
  const semester = Number(semesterInput.value);

  if (!name) {
    alert("Enter a subject name.");
    return;
  }

  try {
    await addDoc(collection(db, "subjects"), {
      name,
      level,
      semester,
      createdAt: serverTimestamp(),
    });

    // Tab changed while the write was in flight — nothing left on
    // screen to reset or reload.
    if (currentContainer !== container || !container.isConnected) return;

    nameInput.value = "";

    await loadSubjects();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

async function loadSubjects() {
  const container = currentContainer;

  const list = container.querySelector("#subjectsList");
  if (!list) return;

  const snapshot = await getDocs(collection(db, "subjects"));

  // Bail if the admin navigated away from Subjects while this fetch
  // was in flight — this is the exact spot that used to crash, since
  // the old code re-looked-up #subjectCount globally *after* this
  // await and got null once the tab had changed.
  if (currentContainer !== container || !container.isConnected) return;

  const countBadge = container.querySelector("#subjectCount");
  if (countBadge) {
    countBadge.textContent = `${snapshot.size} Subject${snapshot.size === 1 ? "" : "s"}`;
  }

  if (snapshot.empty) {
    list.innerHTML = `
      <div class="empty-state">
        No subjects created yet.
      </div>
    `;
    return;
  }

  let html = `
    <div class="subjects-grid">
  `;

  snapshot.forEach((docSnap) => {
    const subject = docSnap.data();

    html += `
  <div class="subject-card">

    <div class="subject-card-info">

        <h3>${subject.name}</h3>

        <small>Available for quizzes</small>

        <div class="subject-tags">
            <span class="subject-tag level">
                ${subject.level} Level
            </span>

            <span class="subject-tag semester">
                ${subject.semesterLabel || `Semester ${subject.semester}`}
            </span>
        </div>

    </div>

    <button class="delete-subject" data-id="${docSnap.id}">
        Delete
    </button>

</div>`;
  });

  html += `</div>`;

  list.innerHTML = html;

  list.querySelectorAll(".delete-subject").forEach((btn) => {
    btn.addEventListener("click", deleteSubject);
  });
}

async function deleteSubject(e) {
  const id = e.currentTarget.dataset.id;
  if (!id) {
    // Defensive: shouldn't happen now that data-id is always set,
    // but deleteDoc() with an undefined id throws a confusing
    // Firestore error rather than this clear one.
    console.error("Delete button is missing a subject id.");
    return;
  }

  if (!confirm("Delete this subject?")) return;

  const container = currentContainer;

  await deleteDoc(doc(db, "subjects", id));

  if (currentContainer !== container || !container.isConnected) return;

  await loadSubjects();
}
