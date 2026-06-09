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

      <div class="section-top">
        <h2>Subjects</h2>
      </div>

      <div class="subject-form">

        <input
          id="subjectName"
          type="text"
          placeholder="Enter subject name"
        />

        <button id="addSubjectBtn">
          Add Subject
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
    alert("Enter a subject name");
    return;
  }

  try {
    await addDoc(collection(db, "subjects"), {
      name,
      createdAt: serverTimestamp(),
    });

    input.value = "";

    loadSubjects();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function loadSubjects() {
  const list = document.getElementById("subjectsList");

  const snapshot = await getDocs(collection(db, "subjects"));

  if (snapshot.empty) {
    list.innerHTML = `
      <p>No subjects yet.</p>
    `;
    return;
  }

  let html = `
    <div class="subjects-grid">
  `;

  snapshot.forEach((docSnap) => {
    const subject = docSnap.data();

    html += `
      <div class="subject-item">

        <span>
          ${subject.name}
        </span>

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
  const id = e.target.dataset.id;

  const confirmed = confirm("Delete this subject?");

  if (!confirmed) return;

  await deleteDoc(doc(db, "subjects", id));

  loadSubjects();
}
