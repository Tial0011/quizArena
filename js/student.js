import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const app = document.getElementById("app");

// Container
const container = document.createElement("div");
container.className =
  "bg-white p-6 rounded-xl shadow w-full max-w-md space-y-4";

// Title
const title = document.createElement("h1");
title.className = "text-xl font-bold text-center";
title.textContent = "QUIZ ARENA";

// Inputs
const nameInput = document.createElement("input");
nameInput.placeholder = "Full Name";
nameInput.required = true;
nameInput.className = "w-full px-4 py-2 border rounded-lg";

const matricInput = document.createElement("input");
matricInput.placeholder = "Matric Number";
matricInput.required = true;
matricInput.className = "w-full px-4 py-2 border rounded-lg";

// Course select
const courseSelect = document.createElement("select");
courseSelect.required = true;
courseSelect.className = "w-full px-4 py-2 border rounded-lg";

const defaultOption = document.createElement("option");
defaultOption.textContent = "Select Course";
defaultOption.value = "";
courseSelect.append(defaultOption);

// Start button
const startBtn = document.createElement("button");
startBtn.textContent = "Start Quiz";
startBtn.className =
  "w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700";

// Load active courses
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

// Start quiz
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

// Build UI
container.append(title, nameInput, matricInput, courseSelect, startBtn);
app.append(container);

loadCourses();
