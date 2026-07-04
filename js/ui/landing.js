import { renderStudentDashboard } from "../student/dashboard.js";
import { loginUser, registerUser, getUserData } from "../auth.js";
import { renderAdminDashboard } from "../admin/dashboard.js";
const app = document.getElementById("app");

let mode = "login";

export function renderLanding() {
  app.innerHTML = `
    <div class="page">

      <section class="hero">

        <div class="live-badge">
          Live Platform
        </div>

        <div class="logo">
          Quiz Arena
        </div>

        <h1>
          Master Your Subjects.<br>
          One Quiz at a Time.
        </h1>

        <p>
          Practice Physics, Biology,
          Chemistry and Statistics with
          weekly quizzes designed for
          serious students.
        </p>

        <div class="stats">
          <div class="stat">
            <h3>5</h3>
            <span>Subjects</span>
          </div>

          <div class="stat">
            <h3>∞</h3>
            <span>Practice</span>
          </div>

          <div class="stat">
            <h3>24/7</h3>
            <span>Access</span>
          </div>
        </div>

      </section>

      <section class="auth-card">

        ${mode === "login" ? loginMarkup() : registerMarkup()}

      </section>

    </div>
  `;

  attachEvents();
}

function loginMarkup() {
  return `
    <h2>Welcome Back</h2>
    <p class="auth-subtitle">Enter your email and password to continue</p>

    <div class="form-group">
      <label for="email">Email</label>
      <div class="input-with-icon">
        <span class="input-icon">✉️</span>
        <input
          id="email"
          type="email"
          placeholder="e.g. arjun@email.com"
        >
      </div>
    </div>

    <div class="form-group">
      <label for="password">Password</label>
      <div class="input-with-icon">
        <span class="input-icon">🔒</span>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
        >
      </div>
    </div>

    <button id="submitBtn" class="submit-btn">
      Sign In
    </button>

    <p class="switch">
      Don't have an account?

      <span id="switchMode">
        Register
      </span>
    </p>
  `;
}

function registerMarkup() {
  return `
    <h2>Create Account</h2>
    <p class="auth-subtitle">Set up your details to get started</p>

    <div class="form-group">
      <label for="name">Full Name</label>
      <div class="input-with-icon">
        <span class="input-icon">👤</span>
        <input
          id="name"
          placeholder="e.g. Arjun Sharma"
        >
      </div>
    </div>

    <div class="form-group">
      <label for="email">Email</label>
      <div class="input-with-icon">
        <span class="input-icon">✉️</span>
        <input
          id="email"
          type="email"
          placeholder="e.g. arjun@email.com"
        >
      </div>
    </div>

    <div class="form-group">
      <label for="password">Password</label>
      <div class="input-with-icon">
        <span class="input-icon">🔒</span>
        <input
          id="password"
          type="password"
          placeholder="Create a password"
        >
      </div>
    </div>

    <button id="submitBtn" class="submit-btn">
      Register
    </button>

    <p class="switch">
      Already have an account?

      <span id="switchMode">
        Login
      </span>
    </p>
  `;
}

function attachEvents() {
  document.getElementById("switchMode")?.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";

    renderLanding();
  });

  document.getElementById("submitBtn")?.addEventListener("click", submitForm);
}

async function submitForm() {
  const submitBtn = document.getElementById("submitBtn");

  submitBtn.disabled = true;
  submitBtn.textContent = "Loading...";
  const email = document.getElementById("email").value;

  const password = document.getElementById("password").value;

  let result;

  if (mode === "register") {
    const name = document.getElementById("name").value;

    result = await registerUser(name, email, password);
  } else {
    result = await loginUser(email, password);
  }

  if (!result.success) {
    alert(result.message);
    submitBtn.disabled = false;

    submitBtn.textContent = mode === "login" ? "Sign In" : "Register";
    return;
  }

  const ADMIN_EMAIL = "admin@test.com";

  if (result.user.email === ADMIN_EMAIL) {
    renderAdminDashboard();
  } else {
    const userData = await getUserData(result.user.uid);

    renderStudentDashboard(userData);
  }
}
