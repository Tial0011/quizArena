import { loginUser } from "./auth.js";

const app = document.getElementById("app");

let currentUser = null;
let activeTab = "dashboard";

// =========================
// LANDING CONTROLLER
// =========================
export function renderLanding() {
  if (!currentUser) {
    renderLoggedOut();
  } else {
    renderLoggedIn();
  }
}

// =========================
// LOGGED OUT (LOGIN PAGE)
// =========================
function renderLoggedOut() {
  app.innerHTML = `
    <div class="layout">

      <!-- HERO -->
      <div class="left">
        <p class="badge">● Live Platform — Week 1 Active</p>

        <h1>
          Master Your <br>
          <span>Subjects.</span><br>
          One Quiz at a Time.
        </h1>

        <p class="desc">
          Weekly academic quizzes for Physics, Chemistry, and Biology —
          structured around your class curriculum with smart timers and randomized questions.
        </p>

        <div class="actions">
          <button class="primary" id="startBtn">Start Learning</button>
        </div>

        <div class="stats">
          <div><strong>5,000+</strong><span>Active Students</span></div>
          <div><strong>200+</strong><span>Weekly Quizzes</span></div>
          <div><strong>95%</strong><span>Success Rate</span></div>
        </div>
      </div>

      <!-- LOGIN -->
      <div class="right" id="loginSection">
        <div class="card">
          <h3>Welcome back</h3>
          <p class="small">Enter your email and password to continue</p>

          <input id="email" type="email" placeholder="Email" />
          <input id="password" type="password" placeholder="Password" />

          <button id="loginBtn">Sign In</button>

          <p id="error" class="error"></p>
        </div>
      </div>

    </div>
  `;

  // Scroll to login
  document.getElementById("startBtn").onclick = () => {
    document.getElementById("loginSection").scrollIntoView({
      behavior: "smooth",
    });
  };

  // LOGIN LOGIC
  document.getElementById("loginBtn").onclick = async () => {
    const btn = document.getElementById("loginBtn");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const errorEl = document.getElementById("error");
    errorEl.textContent = "";

    btn.textContent = "Signing in...";
    btn.disabled = true;

    const result = await loginUser(email, password);

    console.log("LOGIN RESULT:", result); // 🔥 DEBUG

    if (result.success) {
      currentUser = result.user;

      // 🔥 ROUTING
      if (result.role === "admin") {
        renderAdminDashboard();
      } else {
        renderLoggedIn();
      }
    } else {
      errorEl.textContent = result.message;
      btn.textContent = "Sign In";
      btn.disabled = false;
    }
  };
}

// =========================
// STUDENT SUCCESS PAGE
// =========================
function renderLoggedIn() {
  app.innerHTML = `
    <div class="center fade-in">
      <div class="card">
        <h2>Welcome 🎉</h2>
        <p>You are now logged in successfully.</p>
      </div>
    </div>
  `;
}

// =========================
// ADMIN DASHBOARD
// =========================
export function renderAdminDashboard() {
  app.innerHTML = `
    <div class="admin-container">

      <!-- HEADER -->
      <div class="header">
        <div>
          <h2>Admin Dashboard</h2>
          <p>Manage quizzes, users, and settings</p>
        </div>
        <div class="avatar">A</div>
      </div>

      <!-- STATUS -->
      <p class="status">🟢 System online — All services running</p>

      <!-- TABS -->
      <div class="tabs">
        <button class="tab ${activeTab === "dashboard" ? "active" : ""}" data-tab="dashboard">Dashboard</button>
        <button class="tab ${activeTab === "questions" ? "active" : ""}" data-tab="questions">Questions</button>
        <button class="tab ${activeTab === "users" ? "active" : ""}" data-tab="users">Users</button>
        <button class="tab ${activeTab === "settings" ? "active" : ""}" data-tab="settings">Settings</button>
      </div>

      <!-- CONTENT -->
      <div id="tabContent"></div>

    </div>
  `;

  setupTabs();
  renderTabContent();
}

// =========================
// TAB SWITCHING
// =========================
function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      renderAdminDashboard();
    };
  });
}

// =========================s
// TAB CONTENT
// =========================
function renderTabContent() {
  const container = document.getElementById("tabContent");

  if (activeTab === "dashboard") {
    container.innerHTML = `
      <div class="welcome-card">
        <h3>Quiz Arena Admin</h3>
        <p>You have 3 active weeks running</p>
      </div>

      <h4 class="section-title">Overview</h4>

      <div class="stats">
        <div class="stat-card">
          <p>Total Students</p>
          <h2>248</h2>
        </div>

        <div class="stat-card">
          <p>Total Questions</p>
          <h2>1,340</h2>
        </div>

        <div class="stat-card">
          <p>Active Weeks</p>
          <h2>3</h2>
        </div>
      </div>

      <h4 class="section-title">Quick Actions</h4>

      <button class="action primary">Add Question →</button>
      <button class="action secondary">Add User →</button>
    `;
  }

  if (activeTab === "questions") {
    container.innerHTML = `<p class="coming">Questions module coming...</p>`;
  }

  if (activeTab === "users") {
    container.innerHTML = `<p class="coming">Users module coming...</p>`;
  }

  if (activeTab === "settings") {
    container.innerHTML = `<p class="coming">Settings module coming...</p>`;
  }
}
