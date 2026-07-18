import { db } from "../firebase/config.js";

import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function renderSubjects(container) {
  container.innerHTML = `
    <div class="admin-card">

      <div class="page-header">

        <div>
          <h2>📚 Subjects</h2>
          <p>Create and manage all available subjects.</p>
        </div>

        <div class="count-badge" id="subjectCount">
          0 Subjects
        </div>

      </div>

      <div class="subject-form">
  <input
    id="subjectName"
    type="text"
    placeholder="Enter subject name (e.g. MTH 121)"
  />

  <select id="subjectLevel">
    <option value="100" selected>100 Level</option>
    <option value="200">200 Level</option>
    <option value="300">300 Level</option>
    <option value="400">400 Level</option>
    <option value="500">500 Level</option>
  </select>

  <select id="subjectSemester">
    <option value="1">First Semester</option>
    <option value="2" selected>Second Semester</option>
  </select>

  <button id="addSubjectBtn">
    + Add Subject
  </button>
</div>
      <div id="subjectsList">
        Loading...
      </div>

    </div>
  `;

  document
    .getElementById("addSubjectBtn")
    .addEventListener("click", addSubject);

  loadSubjects();
}

async function addSubject() {
  const nameInput = document.getElementById("subjectName");
  const levelInput = document.getElementById("subjectLevel");
  const semesterInput = document.getElementById("subjectSemester");

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

    nameInput.value = "";

    loadSubjects();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

async function loadSubjects() {
  const list = document.getElementById("subjectsList");

  const snapshot = await getDocs(collection(db, "subjects"));

  document.getElementById("subjectCount").textContent =
    `${snapshot.size} Subject${snapshot.size === 1 ? "" : "s"}`;

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

    <button class="delete-subject">
        Delete
    </button>

</div>`;
  });

  html += `</div>`;

  list.innerHTML = html;

  document.querySelectorAll(".delete-subject").forEach((btn) => {
    btn.addEventListener("click", deleteSubject);
  });
}

async function deleteSubject(e) {
  if (!confirm("Delete this subject?")) return;

  await deleteDoc(doc(db, "subjects", e.target.dataset.id));

  loadSubjects();
}
