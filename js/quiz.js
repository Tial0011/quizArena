import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/* ---------- SESSION DATA ---------- */
const studentName = sessionStorage.getItem("studentName");
const matric = sessionStorage.getItem("matric");
const courseId = sessionStorage.getItem("courseId");

if (!studentName || !matric || !courseId) {
  window.location.href = "index.html";
}

/* ---------- STATE ---------- */
let questions = [];
let currentIndex = 0;
let answers = {};
let timeLeft = 0;
let timerInterval = null;

/* ---------- APP ROOT ---------- */
const app = document.getElementById("app");

/* ---------- QUOTE ---------- */
function getQuote(score, total) {
  const percent = (score / total) * 100;
  if (percent >= 80) return "Excellent performance! Keep it up 💪";
  if (percent >= 60) return "Good job! Keep practicing 👍";
  if (percent >= 40) return "Fair attempt. Revise more 📚";
  return "Don’t give up. Practice makes perfect 💙";
}

/* ---------- LOAD COURSE & QUESTIONS ---------- */
async function loadQuiz() {
  try {
    // Get course
    const courseRef = doc(db, "courses", courseId);
    const courseSnap = await getDoc(courseRef);

    if (!courseSnap.exists()) {
      alert("Course not found.");
      window.location.href = "index.html";
      return;
    }

    const course = courseSnap.data();

    // ⏱️ duration is stored in MINUTES
    timeLeft = Number(course.duration) * 60;

    // Safety fallback
    if (isNaN(timeLeft) || timeLeft <= 0) {
      timeLeft = 15 * 60; // default 15 minutes
    }

    // Get questions
    const qSnap = await getDocs(
      collection(db, "courses", courseId, "questions")
    );

    qSnap.forEach((q) => {
      questions.push({ id: q.id, ...q.data() });
    });

    if (questions.length === 0) {
      alert("No questions available for this course.");
      window.location.href = "index.html";
      return;
    }

    buildUI(course.title);
    startTimer();
    renderQuestion();
  } catch (err) {
    console.error(err);
    alert("Failed to load quiz.");
  }
}

/* ---------- BUILD UI ---------- */
function buildUI(courseTitle) {
  app.innerHTML = "";

  const container = document.createElement("div");
  container.className = "max-w-3xl mx-auto p-6";

  // Header
  const header = document.createElement("div");
  header.className = "flex justify-between items-center mb-4";

  const title = document.createElement("h1");
  title.className = "text-xl font-bold";
  title.textContent = courseTitle;

  const timer = document.createElement("span");
  timer.id = "timer";
  timer.className = "font-semibold text-red-600";

  header.append(title, timer);

  // Question box
  const box = document.createElement("div");
  box.id = "questionBox";
  box.className = "bg-white p-6 rounded-xl shadow";

  // Navigation
  const nav = document.createElement("div");
  nav.className = "flex justify-between mt-4";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Previous";
  prevBtn.className = "px-4 py-2 bg-gray-300 rounded";
  prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  };

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.className = "px-4 py-2 bg-blue-600 text-white rounded";
  nextBtn.onclick = () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      confirmSubmit();
    }
  };

  nav.append(prevBtn, nextBtn);
  container.append(header, box, nav);
  app.append(container);
}

/* ---------- RENDER QUESTION ---------- */
function renderQuestion() {
  const q = questions[currentIndex];
  const box = document.getElementById("questionBox");

  const letters = ["A", "B", "C", "D"];

  box.innerHTML = `
    <p class="font-semibold mb-4">
      Question ${currentIndex + 1} of ${questions.length}
    </p>
    <p class="mb-4">${q.question}</p>
  `;

  q.options.forEach((opt, i) => {
    const label = document.createElement("label");
    label.className = "block mb-2 cursor-pointer";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "option";
    radio.value = i;
    radio.checked = answers[currentIndex] === i;

    radio.onchange = () => {
      answers[currentIndex] = i;
    };

    label.append(radio, ` ${letters[i]}. ${opt}`);
    box.append(label);
  });
}

/* ---------- TIMER ---------- */
function startTimer() {
  updateTimerUI();

  timerInterval = setInterval(() => {
    timeLeft--;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      updateTimerUI();
      alert("Time is up! Quiz will be submitted.");
      submitQuiz();
      return;
    }

    updateTimerUI();
  }, 1000);
}

function updateTimerUI() {
  const timer = document.getElementById("timer");
  if (!timer) return;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  timer.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
}

/* ---------- CONFIRM SUBMIT ---------- */
function confirmSubmit() {
  if (confirm("Are you sure you want to submit your quiz?")) {
    submitQuiz();
  }
}

/* ---------- SUBMIT ---------- */
async function submitQuiz() {
  clearInterval(timerInterval);

  let score = 0;
  const correctAnswers = [];

  questions.forEach((q, i) => {
    correctAnswers.push(q.correct);
    if (answers[i] === q.correct) score++;
  });

  const quote = getQuote(score, questions.length);

  const ref = await addDoc(collection(db, "results"), {
    name: studentName,
    matric,
    courseId,
    score,
    total: questions.length,
    answers,
    correctAnswers,
    quote,
    submittedAt: serverTimestamp(),
  });

  sessionStorage.clear();
  window.location.href = `review.html?id=${ref.id}`;
}

/* ---------- START ---------- */
loadQuiz();
