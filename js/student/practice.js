import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { startQuiz } from "./quiz.js";

export async function renderPracticeArena() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="dashboard">

      <div class="admin-card">

        <h2>
          Practice Arena
        </h2>

        <select id="subjectSelect">
          <option value="">
            Select Subject
          </option>
        </select>

        <select id="questionCount">

          <option value="10">
            10 Questions
          </option>

          <option value="20">
            20 Questions
          </option>

          <option value="30">
            30 Questions
          </option>

        </select>

        <select id="timeLimit">

          <option value="10">
            10 Minutes
          </option>

          <option value="15">
            15 Minutes
          </option>

          <option value="20">
            20 Minutes
          </option>

        </select>

        <button id="startPracticeBtn">
          Start Practice
        </button>

      </div>

    </div>
  `;

  await loadSubjects();

  document
    .getElementById("startPracticeBtn")
    .addEventListener("click", beginPractice);
}
async function loadSubjects() {
  const select = document.getElementById("subjectSelect");

  const snapshot = await getDocs(collection(db, "subjects"));

  snapshot.forEach((docSnap) => {
    const subject = docSnap.data();

    select.innerHTML += `
      <option value="${subject.name}">
        ${subject.name}
      </option>
    `;
  });
}
async function beginPractice() {
  const subject = document.getElementById("subjectSelect").value;

  const count = Number(document.getElementById("questionCount").value);

  const time = Number(document.getElementById("timeLimit").value);

  if (!subject) {
    alert("Select subject");
    return;
  }

  startQuiz(subject, count, time);
}
