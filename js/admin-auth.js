import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

const app = document.getElementById("app");

// Wrapper
const wrapper = document.createElement("div");
wrapper.className = "bg-white w-full max-w-md p-6 rounded-xl shadow-md";

// Title
const title = document.createElement("h1");
title.className = "text-2xl font-bold text-center mb-6";
title.textContent = "Admin Login";

// Form
const form = document.createElement("form");
form.className = "space-y-4";

// Email input
const emailGroup = document.createElement("div");

const emailLabel = document.createElement("label");
emailLabel.className = "block text-sm font-medium mb-1";
emailLabel.textContent = "Email";

const emailInput = document.createElement("input");
emailInput.type = "email";
emailInput.required = true;
emailInput.className =
  "w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

emailGroup.append(emailLabel, emailInput);

// Password input
const passGroup = document.createElement("div");

const passLabel = document.createElement("label");
passLabel.className = "block text-sm font-medium mb-1";
passLabel.textContent = "Password";

const passInput = document.createElement("input");
passInput.type = "password";
passInput.required = true;
passInput.className =
  "w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

passGroup.append(passLabel, passInput);

// Button
const button = document.createElement("button");
button.type = "submit";
button.textContent = "Login";
button.className =
  "w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition";

// Error message
const errorMsg = document.createElement("p");
errorMsg.className = "text-red-500 text-sm text-center hidden";

// Submit logic
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passInput.value);
    window.location.href = "dashboard.html";
  } catch (err) {
    errorMsg.textContent = "Invalid login details";
    errorMsg.classList.remove("hidden");
  }
});

// Build form
form.append(emailGroup, passGroup, button, errorMsg);
wrapper.append(title, form);
app.append(wrapper);
