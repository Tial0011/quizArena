import { db } from "../firebase/config.js";

import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function renderQuestions(container) {
  container.innerHTML = `
    <div class="admin-card">

      <h2>Questions</h2>

      <div class="question-form">

        <select id="quizSelect">
          <option value="">
            Select Quiz
          </option>
        </select>

        <textarea
          id="questionInput"
          placeholder="Enter Question"
        ></textarea>

        <input
          id="optionA"
          placeholder="Option A"
        >

        <input
          id="optionB"
          placeholder="Option B"
        >

        <input
          id="optionC"
          placeholder="Option C"
        >

        <input
          id="optionD"
          placeholder="Option D"
        >

        <select id="answerSelect">
          <option value="">
            Correct Answer
          </option>

          <option value="0">
            Option A
          </option>

          <option value="1">
            Option B
          </option>

          <option value="2">
            Option C
          </option>

          <option value="3">
            Option D
          </option>
        </select>

        <button id="addQuestionBtn">
          Add Question
        </button>

      </div>

      <div id="questionList"></div>

    </div>
  `;

  await loadQuizOptions();

  document
    .getElementById("addQuestionBtn")
    .addEventListener("click", addQuestion);

  document
    .getElementById("quizSelect")
    .addEventListener("change", loadQuestions);
}

async function loadQuizOptions() {
  const select = document.getElementById("quizSelect");

  const snapshot = await getDocs(collection(db, "quizzes"));

  snapshot.forEach((docSnap) => {
    const quiz = docSnap.data();

    select.innerHTML += `
      <option value="${docSnap.id}">
        ${quiz.subjectName}
        Week ${quiz.week}
        - ${quiz.title}
      </option>
    `;
  });
}

async function addQuestion() {
  const quizId = document.getElementById("quizSelect").value;

  const question = document.getElementById("questionInput").value.trim();

  const optionA = document.getElementById("optionA").value.trim();

  const optionB = document.getElementById("optionB").value.trim();

  const optionC = document.getElementById("optionC").value.trim();

  const optionD = document.getElementById("optionD").value.trim();

  const answer = document.getElementById("answerSelect").value;

  if (
    !quizId ||
    !question ||
    !optionA ||
    !optionB ||
    !optionC ||
    !optionD ||
    answer === ""
  ) {
    alert("Complete all fields");
    return;
  }

  const quizSnapshot = await getDocs(
    query(collection(db, "quizzes"), where("__name__", "==", quizId)),
  );

  let subjectName = "";

  quizSnapshot.forEach((docSnap) => {
    subjectName = docSnap.data().subjectName;
  });

  await addDoc(collection(db, "questions"), {
    quizId,

    subjectName,

    question,

    options: [optionA, optionB, optionC, optionD],

    answer: Number(answer),

    createdAt: serverTimestamp(),
  });

  alert("Question Added Successfully!");

  clearForm();

  loadQuestions();
}

async function loadQuestions() {
  const quizId = document.getElementById("quizSelect").value;

  const list = document.getElementById("questionList");

  if (!quizId) {
    list.innerHTML = "";
    return;
  }

  const q = query(collection(db, "questions"), where("quizId", "==", quizId));

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    list.innerHTML = "<p>No questions yet.</p>";
    return;
  }

  let html = "";

  let count = 1;

  snapshot.forEach((docSnap) => {
    const question = docSnap.data();

    html += `
  <div class="question-item">

    <h4>
      ${count}. ${question.question}
    </h4>

    <div class="question-options">

      <p>
        A. ${question.options[0]}
      </p>

      <p>
        B. ${question.options[1]}
      </p>

      <p>
        C. ${question.options[2]}
      </p>

      <p>
        D. ${question.options[3]}
      </p>

    </div>

    <div class="correct-answer">

      ✅ Correct Answer:
      ${["A", "B", "C", "D"][question.answer]}

    </div>

  </div>
`;

    count++;
  });

  list.innerHTML = html;
}

function clearForm() {
  document.getElementById("questionInput").value = "";

  document.getElementById("optionA").value = "";

  document.getElementById("optionB").value = "";

  document.getElementById("optionC").value = "";

  document.getElementById("optionD").value = "";

  document.getElementById("answerSelect").value = "";
}
