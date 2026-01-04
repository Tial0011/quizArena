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
let hasSubmitted = false;

/* ---------- ROOT ---------- */
const app = document.getElementById("app");

/* ---------- QUOTE ---------- */
function getQuote(score, total) {
  const percent = (score / total) * 100;
  if (percent >= 80) return "Excellent performance! Keep it up 💪";
  if (percent >= 60) return "Good job! Keep practicing 👍";
  if (percent >= 40) return "Fair attempt. Revise more 📚";
  return "Don’t give up. Practice makes perfect 💙";
}

/* ---------- LOAD QUIZ ---------- */
async function loadQuiz() {
  const courseSnap = await getDoc(doc(db, "courses", courseId));
  if (!courseSnap.exists()) return alert("Course not found");

  const course = courseSnap.data();
  timeLeft = Number(course.duration) * 60 || 15 * 60;

  const qSnap = await getDocs(collection(db, "courses", courseId, "questions"));

  qSnap.forEach((q) => questions.push({ id: q.id, ...q.data() }));
  if (!questions.length) return alert("No questions available");

  buildUI(course.title);
  startTimer();
  renderQuestion();
}

/* ---------- BUILD UI ---------- */
function buildUI(courseTitle) {
  app.innerHTML = "";

  const page = document.createElement("div");
  page.className = "min-h-screen bg-white";

  /* ---------- NAVBAR ---------- */
  const nav = document.createElement("div");
  nav.className =
    "sticky top-0 z-50 bg-white border-b border-teal-200 shadow-sm";

  nav.innerHTML = `
    <div class="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
      <div class="flex items-center gap-2 font-bold text-teal-700 text-lg">
        <img src="./assets/logo.jpg" class="h-8" />
        Quiz Arena
      </div>

      <div class="flex items-center">
        <button
          id="calcBtn"
            class="mr-6 w-9 h-9 flex items-center justify-center 
            border border-teal-400 rounded-full 
            hover:bg-teal-50 transition overflow-hidden">
          <img
            src="./assets/calc.jpg"
            alt="calc"
            class="w-4 h-4 object-contain pointer-events-none"
          />
        </button>


        <span id="timer" class="font-semibold text-red-600 text-sm"></span>
      </div>
    </div>
  `;

  /* ---------- MAIN ---------- */
  const main = document.createElement("div");
  main.className = "max-w-4xl mx-auto p-4";

  const title = document.createElement("h2");
  title.className = "text-sm text-gray-500 mb-2";
  title.textContent = courseTitle;

  const box = document.createElement("div");
  box.id = "questionBox";
  box.className = "bg-white border border-teal-200 rounded-xl p-6 shadow-sm";

  /* ---------- NAV BUTTONS ---------- */
  const navBtns = document.createElement("div");
  navBtns.className = "flex justify-between mt-4";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Previous";
  prevBtn.className =
    "px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition";
  prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  };

  const nextBtn = document.createElement("button");
  nextBtn.id = "nextBtn";
  nextBtn.className =
    "px-5 py-2 rounded bg-teal-600 text-white hover:bg-teal-700 transition";
  nextBtn.onclick = () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      confirmSubmit();
    }
  };

  navBtns.append(prevBtn, nextBtn);

  /* ---------- STATUS PANEL ---------- */
  const statusPanel = document.createElement("div");
  statusPanel.id = "statusPanel";
  statusPanel.className = "mt-6 flex flex-wrap justify-center gap-2";

  /* ---------- CALCULATOR MODAL ---------- */
  const calcModal = document.createElement("div");
  calcModal.id = "calcModal";
  calcModal.className =
    "fixed inset-0 bg-black/30 hidden flex items-center justify-center z-50";

  calcModal.innerHTML = `
    <div class="bg-white w-72 rounded-xl shadow-lg p-4 border border-teal-200">
      <div class="flex justify-between items-center mb-2">
        <h3 class="font-semibold text-teal-700">Calculator</h3>
        <button id="closeCalc" class="text-gray-500">✕</button>
      </div>

      <input
        id="calcDisplay"
        type="text"
        readonly
        class="w-full mb-3 p-2 border rounded text-right text-lg"
      />

      <div class="grid grid-cols-4 gap-2 text-sm">
        ${[
          "7",
          "8",
          "9",
          "/",
          "4",
          "5",
          "6",
          "*",
          "1",
          "2",
          "3",
          "-",
          "0",
          ".",
          "√",
          "+=",
        ]
          .map(
            (b) =>
              `<button class="calcKey p-2 border rounded hover:bg-teal-50 transition">${b}</button>`
          )
          .join("")}
      </div>

      <button
        id="clearCalc"
        class="mt-3 w-full p-2 bg-gray-100 hover:bg-gray-200 transition rounded text-sm"
      >
        Clear
      </button>
    </div>
  `;

  main.append(title, box, navBtns, statusPanel);
  page.append(nav, main, calcModal);
  app.append(page);
}

/* ---------- RENDER QUESTION ---------- */
function renderQuestion() {
  const q = questions[currentIndex];
  const box = document.getElementById("questionBox");
  const letters = ["A", "B", "C", "D"];

  box.innerHTML = `
    <p class="text-sm text-gray-500 mb-2">
      Question ${currentIndex + 1} of ${questions.length}
    </p>
    <p class="font-medium mb-4">${q.question}</p>
  `;

  q.options.forEach((opt, i) => {
    const label = document.createElement("label");
    label.className =
      "block p-3 mb-2 rounded border cursor-pointer transition " +
      (answers[currentIndex] === i
        ? "border-teal-500 bg-teal-50"
        : "border-gray-200 hover:bg-gray-50");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "option";
    radio.className = "mr-2";
    radio.checked = answers[currentIndex] === i;

    radio.onchange = () => {
      answers[currentIndex] = i;
      renderQuestion();
      renderStatusPanel();
    };

    label.append(radio, `${letters[i]}. ${opt}`);
    box.append(label);
  });

  updateNextButton();
  renderStatusPanel();
}

/* ---------- NEXT / SUBMIT ---------- */
function updateNextButton() {
  const btn = document.getElementById("nextBtn");
  btn.textContent = currentIndex === questions.length - 1 ? "Submit" : "Next";
  btn.className =
    currentIndex === questions.length - 1
      ? "px-5 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition"
      : "px-5 py-2 rounded bg-teal-600 text-white hover:bg-teal-700 transition";
}

/* ---------- STATUS PANEL ---------- */
function renderStatusPanel() {
  const panel = document.getElementById("statusPanel");
  panel.innerHTML = "";

  questions.forEach((_, i) => {
    const b = document.createElement("button");
    b.textContent = i + 1;
    b.className =
      "w-9 h-9 rounded text-sm border transition " +
      (answers[i] !== undefined
        ? "bg-teal-600 text-white border-teal-600"
        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50");

    b.onclick = () => {
      currentIndex = i;
      renderQuestion();
    };

    panel.append(b);
  });
}

/* ---------- TIMER ---------- */
function startTimer() {
  updateTimerUI();
  timerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitQuiz();
    }
    updateTimerUI();
  }, 1000);
}

function updateTimerUI() {
  const t = document.getElementById("timer");
  if (!t) return;
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  t.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

/* ---------- CALCULATOR LOGIC ---------- */
document.addEventListener("click", (e) => {
  const modal = document.getElementById("calcModal");
  const display = document.getElementById("calcDisplay");

  if (e.target.id === "calcBtn") modal.classList.remove("hidden");
  if (e.target.id === "closeCalc") modal.classList.add("hidden");

  if (e.target.classList.contains("calcKey")) {
    const val = e.target.textContent;

    if (val === "+=") {
      try {
        display.value = eval(display.value || "0");
      } catch {
        display.value = "Error";
      }
    } else if (val === "√") {
      display.value = Math.sqrt(Number(display.value || 0));
    } else {
      display.value += val;
    }
  }

  if (e.target.id === "clearCalc") display.value = "";
});

/* ---------- SUBMIT ---------- */
function confirmSubmit() {
  if (confirm("Submit quiz now?")) submitQuiz();
}

async function submitQuiz() {
  if (hasSubmitted) return;
  hasSubmitted = true;
  clearInterval(timerInterval);

  let score = 0;
  const correctAnswers = [];

  questions.forEach((q, i) => {
    correctAnswers.push(q.correct);
    if (answers[i] === q.correct) score++;
  });

  const ref = await addDoc(collection(db, "results"), {
    name: studentName,
    matric,
    courseId,
    score,
    total: questions.length,
    answers,
    correctAnswers,
    quote: getQuote(score, questions.length),
    submittedAt: serverTimestamp(),
  });

  sessionStorage.clear();
  window.location.href = `review.html?id=${ref.id}`;
}

/* ---------- AUTO SUBMIT ---------- */
window.addEventListener("beforeunload", () => {
  if (!hasSubmitted) submitQuiz();
});

/* ---------- START ---------- */
loadQuiz();
