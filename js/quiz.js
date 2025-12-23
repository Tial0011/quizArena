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
let hasSubmitted = false; // 🔒 prevent double submission

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

/* ---------- LOAD QUIZ ---------- */
async function loadQuiz() {
  try {
    const courseSnap = await getDoc(doc(db, "courses", courseId));

    if (!courseSnap.exists()) {
      alert("Course not found.");
      return;
    }

    const course = courseSnap.data();

    // duration stored in MINUTES
    timeLeft = Number(course.duration) * 60;
    if (isNaN(timeLeft) || timeLeft <= 0) timeLeft = 15 * 60;

    const qSnap = await getDocs(
      collection(db, "courses", courseId, "questions")
    );

    qSnap.forEach((q) => questions.push({ id: q.id, ...q.data() }));

    if (!questions.length) {
      alert("No questions available.");
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

  const bgWrapper = document.createElement("div");
  bgWrapper.className =
    "min-h-screen bg-cover bg-center flex justify-center items-start p-4";
  bgWrapper.style.backgroundImage = "url('./assets/quiz-bg.jpg')";

  const container = document.createElement("div");
  container.className = "w-full max-w-3xl";

  const header = document.createElement("div");
  header.className =
    "flex justify-between items-center mb-4 p-4 rounded-xl shadow";
  header.style.backgroundColor = "#ffffff";

  const title = document.createElement("h1");
  title.className = "text-lg font-bold";
  title.textContent = courseTitle;

  const timer = document.createElement("span");
  timer.id = "timer";
  timer.className = "font-semibold text-red-600";

  header.append(title, timer);

  const box = document.createElement("div");
  box.id = "questionBox";
  box.className = "bg-white p-6 rounded-xl shadow";

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
  nextBtn.id = "nextBtn";
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

  const statusPanel = document.createElement("div");
  statusPanel.id = "statusPanel";
  statusPanel.className =
    "mt-4 bg-white p-4 rounded-xl shadow flex flex-wrap justify-center";

  container.append(header, box, nav, statusPanel);
  bgWrapper.append(container);
  app.append(bgWrapper);
}

/* ---------- RENDER QUESTION ---------- */
function renderQuestion() {
  const q = questions[currentIndex];
  const box = document.getElementById("questionBox");
  const letters = ["A", "B", "C", "D"];

  box.innerHTML = `
    <p class="font-semibold mb-2">
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
    radio.checked = answers[currentIndex] === i;

    radio.onchange = () => {
      answers[currentIndex] = i;
      renderStatusPanel();
    };

    label.append(radio, ` ${letters[i]}. ${opt}`);
    box.append(label);
  });

  updateNextButton();
  renderStatusPanel();
}

/* ---------- NEXT / SUBMIT ---------- */
function updateNextButton() {
  const btn = document.getElementById("nextBtn");
  if (currentIndex === questions.length - 1) {
    btn.textContent = "Submit";
    btn.className = "px-4 py-2 bg-green-600 text-white rounded";
  } else {
    btn.textContent = "Next";
    btn.className = "px-4 py-2 bg-blue-600 text-white rounded";
  }
}

/* ---------- STATUS PANEL ---------- */
function renderStatusPanel() {
  const panel = document.getElementById("statusPanel");
  panel.innerHTML = ""; // ✅ clear first

  questions.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.textContent = i + 1;
    btn.className =
      "w-8 h-8 m-1 rounded text-sm " +
      (answers[i] !== undefined ? "bg-green-500 text-white" : "bg-gray-300");

    btn.onclick = () => {
      currentIndex = i;
      renderQuestion();
    };

    panel.append(btn);
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
  if (hasSubmitted) return;
  hasSubmitted = true;

  clearInterval(timerInterval);

  let score = 0;
  const correctAnswers = [];

  questions.forEach((q, i) => {
    correctAnswers.push(q.correct);
    if (answers[i] === q.correct) score++;
  });

  try {
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
  } catch (err) {
    console.error(err);
    alert("Submission failed. Please contact the admin.");
  }
}

/* ---------- AUTO SUBMIT ON TAB CLOSE ---------- */
window.addEventListener("beforeunload", (e) => {
  if (!hasSubmitted) {
    submitQuiz();
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------- START ---------- */
loadQuiz();
