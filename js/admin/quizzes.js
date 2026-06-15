import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function renderQuizzes(container) {
  container.innerHTML = `
    <div class="admin-card">

      <h2>Quizzes</h2>

      <div class="quiz-form">

        <select id="subjectSelect">
          <option value="">
            Select Subject
          </option>
        </select>

        <input
          id="weekInput"
          type="number"
          min="1"
          placeholder="Week Number"
        >

        <input
          id="titleInput"
          placeholder="Quiz Topic (e.g Magnetic Force)"
        >

        <input
          id="priceInput"
          type="number"
          min="0"
          placeholder="Price"
        >

        <button id="createQuizBtn">
          Create Quiz
        </button>

      </div>

      <div id="quizList">
        Loading...
      </div>

    </div>
  `;

  await loadSubjects();
  await loadQuizzes();

  document
    .getElementById("createQuizBtn")
    .addEventListener("click", createQuiz);
}

async function loadSubjects() {
  const select = document.getElementById("subjectSelect");

  const snapshot = await getDocs(collection(db, "subjects"));

  snapshot.forEach((docSnap) => {
    const subject = docSnap.data();

    select.innerHTML += `
      <option value="${docSnap.id}">
        ${subject.name}
      </option>
    `;
  });
}

async function createQuiz() {
  const subjectSelect = document.getElementById("subjectSelect");

  const subjectId = subjectSelect.value;

  const subjectName = subjectSelect.options[subjectSelect.selectedIndex]?.text;

  const week = document.getElementById("weekInput").value;

  const title = document.getElementById("titleInput").value.trim();

  const price = document.getElementById("priceInput").value;

  if (!subjectId || !week || !title || !price) {
    alert("Complete all fields");
    return;
  }

  await addDoc(collection(db, "quizzes"), {
    subjectId,
    subjectName,

    week: Number(week),

    title,

    price: Number(price),

    active: true,

    createdAt: serverTimestamp(),
  });

  document.getElementById("weekInput").value = "";
  document.getElementById("titleInput").value = "";
  document.getElementById("priceInput").value = "";

  loadQuizzes();
}

async function loadQuizzes() {
  const list = document.getElementById("quizList");

  const snapshot = await getDocs(collection(db, "quizzes"));

  if (snapshot.empty) {
    list.innerHTML = "<p>No quizzes yet.</p>";
    return;
  }

  let html = '<div class="quiz-grid">';

  snapshot.forEach((docSnap) => {
    const quiz = docSnap.data();

    html += `
      <div class="quiz-item">

        <div>

          <h4>
            ${quiz.subjectName}
            Week ${quiz.week}
          </h4>

          <p>
            ${quiz.title}
          </p>

          <small>
            ₦${quiz.price}
          </small>

        </div>

        <button
          class="deleteQuiz"
          data-id="${docSnap.id}"
        >
          Delete
        </button>

      </div>
    `;
  });

  html += "</div>";

  list.innerHTML = html;

  document.querySelectorAll(".deleteQuiz").forEach((btn) => {
    btn.addEventListener("click", deleteQuiz);
  });
}

async function deleteQuiz(e) {
  const id = e.target.dataset.id;

  if (!confirm("Delete this quiz?")) {
    return;
  }

  await deleteDoc(doc(db, "quizzes", id));

  loadQuizzes();
}
