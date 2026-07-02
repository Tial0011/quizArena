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
          placeholder="Enter subject name"
        />

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
  const input = document.getElementById("subjectName");

  const name = input.value.trim();

  if (!name) {
    alert("Enter a subject name.");
    return;
  }

  try {
    await addDoc(collection(db, "subjects"), {
      name,
      createdAt: serverTimestamp(),
    });

    input.value = "";

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

        <div>

          <h3>${subject.name}</h3>

          <small>
            Available for quizzes
          </small>

        </div>

        <button
          class="delete-subject"
          data-id="${docSnap.id}"
        >
          Delete
        </button>

      </div>
    `;
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
