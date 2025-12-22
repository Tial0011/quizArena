import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/* ---------- GET RESULT ID ---------- */
const params = new URLSearchParams(window.location.search);
const resultId = params.get("id");

if (!resultId) {
  alert("Invalid result.");
  window.location.href = "index.html";
}

/* ---------- APP ROOT ---------- */
const app = document.getElementById("app");

/* ---------- LOAD REVIEW ---------- */
async function loadReview() {
  // Fetch result
  const resultRef = doc(db, "results", resultId);
  const resultSnap = await getDoc(resultRef);

  if (!resultSnap.exists()) {
    alert("Result not found.");
    return;
  }

  const result = resultSnap.data();

  // Fetch questions for this course
  const qSnap = await getDocs(
    collection(db, "courses", result.courseId, "questions")
  );

  const questions = [];
  qSnap.forEach((q) => {
    questions.push(q.data());
  });

  renderHeader(result);
  renderQuestions(result, questions);
}

/* ---------- HEADER ---------- */
function renderHeader(data) {
  const header = document.createElement("div");
  header.className = "bg-white p-6 rounded-xl shadow mb-6";

  header.innerHTML = `
    <h1 class="text-2xl font-bold mb-2">Quiz Review</h1>

    <p><b>Name:</b> ${data.name}</p>
    <p><b>Matric Number:</b> ${data.matric}</p>

    <p class="mt-2 font-semibold text-lg">
      Score: ${data.score} / ${data.total}
    </p>

    <p class="mt-3 italic text-blue-600">
      "${data.quote}"
    </p>
  `;

  app.append(header);
}

/* ---------- QUESTIONS & ANSWERS ---------- */
function renderQuestions(result, questions) {
  const labels = ["A", "B", "C", "D"];

  questions.forEach((q, index) => {
    const studentAnswer = result.answers[index];
    const correctAnswer = result.correctAnswers[index];
    const isCorrect = studentAnswer === correctAnswer;

    const box = document.createElement("div");
    box.className = `
      mb-5 p-4 rounded-lg shadow
      ${isCorrect ? "bg-green-100" : "bg-red-100"}
    `;

    box.innerHTML = `
      <p class="font-semibold mb-3">
        ${index + 1}. ${q.question}
      </p>
    `;

    q.options.forEach((opt, i) => {
      let style = "text-gray-700";

      if (i === correctAnswer) {
        style = "text-green-700 font-semibold";
      }

      if (i === studentAnswer && i !== correctAnswer) {
        style = "text-red-700 font-semibold";
      }

      const optEl = document.createElement("p");
      optEl.className = style;
      optEl.textContent = `${labels[i]}. ${opt}`;

      box.append(optEl);
    });

    app.append(box);
  });
}

/* ---------- INIT ---------- */
loadReview();
