import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const app = document.getElementById("app");

let currentCourseId = null;
let currentCourseTitle = "";

/* ---------- MAIN CONTAINER ---------- */
const container = document.createElement("div");
container.className = "max-w-5xl mx-auto p-6";

/* ---------- COURSES VIEW ---------- */
const coursesView = document.createElement("div");

/* Title */
const title = document.createElement("h1");
title.className = "text-2xl font-bold mb-6";
title.textContent = "Manage Courses";

/* Create course form */
const form = document.createElement("form");
form.className = "bg-white p-6 rounded-xl shadow mb-8 space-y-4";

const courseInput = document.createElement("input");
courseInput.placeholder = "Course title";
courseInput.required = true;
courseInput.className = "w-full px-4 py-2 border rounded-lg";

const durationInput = document.createElement("input");
durationInput.type = "number";
durationInput.placeholder = "Duration (minutes)";
durationInput.required = true;
durationInput.className = "w-full px-4 py-2 border rounded-lg";

const addBtn = document.createElement("button");
addBtn.textContent = "Add Course";
addBtn.className = "bg-blue-600 text-white px-6 py-2 rounded-lg";

form.onsubmit = async (e) => {
  e.preventDefault();

  await addDoc(collection(db, "courses"), {
    title: courseInput.value,
    duration: Number(durationInput.value),
    active: true,
  });

  courseInput.value = "";
  durationInput.value = "";

  loadCourses();
};

form.append(courseInput, durationInput, addBtn);

/* Course list */
const courseList = document.createElement("div");
courseList.className = "space-y-4";

/* Load courses */
async function loadCourses() {
  courseList.innerHTML = "";

  const snapshot = await getDocs(collection(db, "courses"));

  snapshot.forEach((snap) => {
    const data = snap.data();

    const card = document.createElement("div");
    card.className =
      "bg-white p-4 rounded-xl shadow flex justify-between items-center";

    const info = document.createElement("div");
    info.innerHTML = `
      <p class="font-semibold">${data.title}</p>
      <p class="text-sm text-gray-500">
        ${data.duration / 60} mins • ${data.active ? "Active" : "Inactive"}
      </p>
    `;

    const actions = document.createElement("div");
    actions.className = "flex gap-2";

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = data.active ? "Deactivate" : "Activate";
    toggleBtn.className = data.active
      ? "bg-red-500 text-white px-3 py-1 rounded"
      : "bg-green-500 text-white px-3 py-1 rounded";

    toggleBtn.onclick = async () => {
      await updateDoc(doc(db, "courses", snap.id), {
        active: !data.active,
      });
      loadCourses();
    };

    const questionBtn = document.createElement("button");
    questionBtn.textContent = "Manage Questions";
    questionBtn.className = "bg-gray-800 text-white px-3 py-1 rounded";

    questionBtn.onclick = () => {
      currentCourseId = snap.id;
      currentCourseTitle = data.title;
      showQuestionsView();
    };

    actions.append(toggleBtn, questionBtn);
    card.append(info, actions);
    courseList.append(card);
  });
}

coursesView.append(title, form, courseList);

/* ---------- QUESTIONS VIEW ---------- */
const questionsView = document.createElement("div");
questionsView.className = "hidden";

/* Back button */
const backBtn = document.createElement("button");
backBtn.textContent = "⬅ Back to Courses";
backBtn.className = "mb-4 text-blue-600";

backBtn.onclick = () => {
  questionsView.className = "hidden";
  coursesView.className = "block";
};

/* Question title */
const qTitle = document.createElement("h2");
qTitle.className = "text-xl font-bold mb-4";

/* Question form */
const qForm = document.createElement("form");
qForm.className = "bg-white p-6 rounded-xl shadow mb-6 space-y-3";

const qInput = document.createElement("input");
qInput.placeholder = "Question";
qInput.required = true;
qInput.className = "w-full px-4 py-2 border rounded-lg";

const options = [];
for (let i = 0; i < 4; i++) {
  const opt = document.createElement("input");
  opt.placeholder = `Option ${i + 1}`;
  opt.required = true;
  opt.className = "w-full px-4 py-2 border rounded-lg";
  options.push(opt);
}

const correctInput = document.createElement("input");
correctInput.type = "number";
correctInput.placeholder = "Correct option (1–4)";
correctInput.required = true;
correctInput.className = "w-full px-4 py-2 border rounded-lg";

const qAddBtn = document.createElement("button");
qAddBtn.textContent = "Add Question";
qAddBtn.className = "bg-blue-600 text-white px-6 py-2 rounded-lg";

qForm.onsubmit = async (e) => {
  e.preventDefault();

  await addDoc(collection(db, "courses", currentCourseId, "questions"), {
    question: qInput.value,
    options: options.map((o) => o.value),
    correct: Number(correctInput.value) - 1,
  });

  qForm.reset();
  loadQuestions();
};

qForm.append(qInput, ...options, correctInput, qAddBtn);

/* Question list */
const qList = document.createElement("div");
qList.className = "space-y-4";

/* Load questions */
async function loadQuestions() {
  qList.innerHTML = "";

  const snapshot = await getDocs(
    collection(db, "courses", currentCourseId, "questions")
  );

  snapshot.forEach((snap) => {
    const q = snap.data();

    const item = document.createElement("div");
    item.className = "bg-white p-4 rounded-xl shadow";

    item.innerHTML = `
      <p class="font-semibold">${q.question}</p>
      <p class="text-sm text-gray-600">
        Correct: Option ${q.correct + 1}
      </p>
    `;

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "mt-2 bg-red-500 text-white px-3 py-1 rounded";

    delBtn.onclick = async () => {
      await deleteDoc(
        doc(db, "courses", currentCourseId, "questions", snap.id)
      );
      loadQuestions();
    };

    item.append(delBtn);
    qList.append(item);
  });
}

/* Show questions view */
function showQuestionsView() {
  coursesView.className = "hidden";
  questionsView.className = "block";
  qTitle.textContent = `Questions — ${currentCourseTitle}`;
  loadQuestions();
}

questionsView.append(backBtn, qTitle, qForm, qList);

/* ---------- BUILD APP ---------- */
container.append(coursesView, questionsView);
app.append(container);

/* Initial load */
loadCourses();
