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
courseSelect.className = "mb-6 px-4 py-2 border rounded-lg";

const defaultOpt = document.createElement("option");
defaultOpt.value = "";
defaultOpt.textContent = "Select Course";
courseSelect.append(defaultOpt);

/* ---------- RESULTS TABLE ---------- */
const table = document.createElement("table");
table.className = "w-full bg-white rounded-xl shadow overflow-hidden";

const thead = document.createElement("thead");
thead.innerHTML = `
  <tr class="bg-gray-200 text-left">
    <th class="p-3">Position</th>
    <th class="p-3">Name</th>
    <th class="p-3">Matric Number</th>
    <th class="p-3">Score</th>
  </tr>
`;

const tbody = document.createElement("tbody");
table.append(thead, tbody);

/* ---------- LOAD COURSES ---------- */
async function loadCourses() {
  const snap = await getDocs(collection(db, "courses"));

  snap.forEach((docSnap) => {
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.textContent = docSnap.data().title;
    courseSelect.append(opt);
  });
}

/* ---------- LOAD RESULTS ---------- */
async function loadResults(courseId) {
  tbody.innerHTML = "";

  const q = query(
    collection(db, "results"),
    where("courseId", "==", courseId),
    orderBy("score", "desc")
  );

  const snap = await getDocs(q);

  let position = 1;

  snap.forEach((docSnap) => {
    const r = docSnap.data();

    const row = document.createElement("tr");
    row.className = "border-t";

    row.innerHTML = `
      <td class="p-3 font-semibold">${position}</td>
      <td class="p-3">${r.name}</td>
      <td class="p-3">${r.matric}</td>
      <td class="p-3">${r.score} / ${r.total}</td>
    `;

    tbody.append(row);
    position++;
  });
}

/* ---------- EVENTS ---------- */
courseSelect.onchange = () => {
  if (courseSelect.value) {
    loadResults(courseSelect.value);
  }
};

/* ---------- BUILD PAGE ---------- */
container.append(title, courseSelect, table);
app.append(container);

/* ---------- INIT ---------- */
loadCourses();
