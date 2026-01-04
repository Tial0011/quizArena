import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const app = document.getElementById("app");

/* ---------- CONTAINER ---------- */
const container = document.createElement("div");
container.className =
  "bg-white p-6 rounded-xl shadow border border-teal-200 w-full max-w-md space-y-4";

/* ---------- TITLE ---------- */
const title = document.createElement("h1");
title.className = "text-xl font-bold text-center text-teal-700";
title.textContent = "QUIZ ARENA";

/* ---------- INPUTS ---------- */
const nameInput = document.createElement("input");
nameInput.placeholder = "Full Name";
nameInput.required = true;
nameInput.className =
  "w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400";

const matricInput = document.createElement("input");
matricInput.placeholder = "Matric Number";
matricInput.required = true;
matricInput.className =
  "w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400";

/* ---------- COURSE SELECT ---------- */
const courseSelect = document.createElement("select");
courseSelect.required = true;
courseSelect.className =
  "w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-400";

const defaultOption = document.createElement("option");
defaultOption.textContent = "Select Course";
defaultOption.value = "";
courseSelect.append(defaultOption);

/* ---------- START BUTTON ---------- */
const startBtn = document.createElement("button");
startBtn.textContent = "Start Quiz";
startBtn.className =
  "w-full bg-teal-600 text-white py-2 rounded-lg font-semibold " +
  "hover:bg-teal-700 transition-colors duration-200 shadow-sm";

/* ---------- LOAD ACTIVE COURSES ---------- */
async function loadCourses() {
  const q = query(collection(db, "courses"), where("active", "==", true));
  const snapshot = await getDocs(q);

  snapshot.forEach((docSnap) => {
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.textContent = docSnap.data().title;
    courseSelect.append(opt);
  });
}

/* ---------- START QUIZ ---------- */
startBtn.onclick = () => {
  if (!nameInput.value || !matricInput.value || !courseSelect.value) {
    alert("Please fill all fields");
    return;
  }

  sessionStorage.setItem("studentName", nameInput.value);
  sessionStorage.setItem("matric", matricInput.value);
  sessionStorage.setItem("courseId", courseSelect.value);

  window.location.href = "quiz.html";
};

/* ---------- BUILD UI ---------- */
container.append(title, nameInput, matricInput, courseSelect, startBtn);
app.append(container);

/* ---------- INIT ---------- */
loadCourses();
