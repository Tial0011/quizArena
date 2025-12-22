import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

const app = document.getElementById("app");

/* ---------- PAGE WRAPPER ---------- */
const container = document.createElement("div");
container.className = "max-w-5xl mx-auto p-6";

/* ---------- HEADER ---------- */
const header = document.createElement("div");
header.className = "flex justify-between items-center mb-6";

const title = document.createElement("h1");
title.className = "text-2xl font-bold";
title.textContent = "Admin Dashboard";

const logoutBtn = document.createElement("button");
logoutBtn.textContent = "Logout";
logoutBtn.className =
  "bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition";

logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "login.html";
};

header.append(title, logoutBtn);

/* ---------- CARDS CONTAINER ---------- */
const cards = document.createElement("div");
cards.className = "grid grid-cols-1 md:grid-cols-2 gap-6";

/* ---------- CARD GENERATOR ---------- */
function createCard(titleText, descText, link) {
  const card = document.createElement("div");
  card.className =
    "bg-white p-6 rounded-xl shadow hover:shadow-lg transition cursor-pointer";

  const h2 = document.createElement("h2");
  h2.className = "text-lg font-semibold mb-2";
  h2.textContent = titleText;

  const p = document.createElement("p");
  p.className = "text-gray-600 text-sm";
  p.textContent = descText;

  card.append(h2, p);

  card.onclick = () => {
    window.location.href = link;
  };

  return card;
}

/* ---------- DASHBOARD CARDS ---------- */
const courseCard = createCard(
  "Manage Courses",
  "Create courses, set duration, and manage questions",
  "courses.html"
);

const resultCard = createCard(
  "View Results",
  "Generate student results, positions, and insights",
  "results.html"
);

cards.append(courseCard, resultCard);

/* ---------- BUILD PAGE ---------- */
container.append(header, cards);
app.append(container);
