import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const app = document.getElementById("app");

/* ---------- CONTAINER ---------- */
const container = document.createElement("div");
container.className = "max-w-6xl mx-auto p-6";

/* ---------- TITLE ---------- */
const title = document.createElement("h1");
title.className = "text-2xl font-bold mb-6";
title.textContent = "Quiz Results";

/* ---------- COURSE SELECT ---------- */
const courseSelect = document.createElement("select");
courseSelect.className = "mb-6 px-4 py-2 border rounded-lg w-full max-w-sm";
courseSelect.innerHTML = `<option value="">Select Course</option>`;

/* ---------- RESULTS TABLE ---------- */
const table = document.createElement("table");
table.className = "w-full bg-white rounded-xl shadow overflow-hidden";

table.innerHTML = `
  <thead>
    <tr class="bg-gray-200 text-left">
      <th class="p-3">Pos</th>
      <th class="p-3">Name</th>
      <th class="p-3">Matric</th>
      <th class="p-3">Score</th>
    </tr>
  </thead>
  <tbody></tbody>
`;

const tbody = table.querySelector("tbody");

/* ---------- LOAD COURSES ---------- */
async function loadCourses() {
  const snap = await getDocs(collection(db, "courses"));
  snap.forEach((doc) => {
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.data().title;
    courseSelect.append(opt);
  });
}

/* ---------- LOAD QUESTIONS (SUBCOLLECTION) ---------- */
async function loadQuestions(courseId) {
  const snap = await getDocs(collection(db, "courses", courseId, "questions"));

  return snap.docs.map((d) => d.data());
}

/* ---------- LOAD RESULTS ---------- */
async function loadResults(courseId) {
  tbody.innerHTML = "";

  const questions = await loadQuestions(courseId);

  const snap = await getDocs(
    query(
      collection(db, "results"),
      where("courseId", "==", courseId),
      orderBy("score", "desc")
    )
  );

  let position = 1;

  snap.forEach((doc) => {
    const r = doc.data();

    /* ---------- MAIN ROW ---------- */
    const row = document.createElement("tr");
    row.className = "border-t hover:bg-gray-50 cursor-pointer";

    row.innerHTML = `
      <td class="p-3 font-semibold">${position}</td>
      <td class="p-3 text-blue-600 underline">${r.name}</td>
      <td class="p-3">${r.matric}</td>
      <td class="p-3">${r.score} / ${r.total}</td>
    `;

    /* ---------- DROPDOWN ROW ---------- */
    const detailRow = document.createElement("tr");
    detailRow.className = "hidden bg-gray-50";

    const detailCell = document.createElement("td");
    detailCell.colSpan = 4;
    detailCell.className = "p-4";

    detailCell.append(buildAnswerReview(r, questions));
    detailRow.append(detailCell);

    row.onclick = () => {
      detailRow.classList.toggle("hidden");
    };

    tbody.append(row, detailRow);
    position++;
  });
}

/* ---------- ANSWER REVIEW ---------- */
function buildAnswerReview(result, questions) {
  const wrapper = document.createElement("div");

  questions.forEach((q, index) => {
    const selectedIndex = result.answers?.[index];
    const correctIndex = q.correct;

    const isCorrect = selectedIndex === correctIndex;

    const box = document.createElement("div");
    box.className =
      "mb-4 p-4 rounded-lg border " +
      (isCorrect ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50");

    box.innerHTML = `
      <p class="font-semibold mb-2">
        Q${index + 1}. ${q.question}
      </p>

      <p>
        Your Answer:
        <strong>
          ${
            selectedIndex !== undefined
              ? q.options[selectedIndex]
              : "Not Answered"
          }
        </strong>
      </p>

      <p>
        Correct Answer:
        <strong>${q.options[correctIndex]}</strong>
      </p>

      <p class="mt-1 font-bold ${
        isCorrect ? "text-green-700" : "text-red-700"
      }">
        ${isCorrect ? "Correct ✅" : "Wrong ❌"}
      </p>
    `;

    wrapper.append(box);
  });

  return wrapper;
}

/* ---------- EVENTS ---------- */
courseSelect.onchange = () => {
  if (courseSelect.value) {
    loadResults(courseSelect.value);
  }
};

/* ---------- BUILD ---------- */
container.append(title, courseSelect, table);
app.append(container);

/* ---------- INIT ---------- */
loadCourses();
