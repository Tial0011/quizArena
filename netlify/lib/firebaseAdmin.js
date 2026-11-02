const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getMessaging } = require("firebase-admin/messaging");
const {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");

const PROJECTS = {
  "quizarena-2c75e": {
    serviceAccountEnv: "FIREBASE_SERVICE_ACCOUNT_JSON",
    appName: "[DEFAULT]",
  },
  "quiz-arena-staging": {
    serviceAccountEnv: "FIREBASE_SERVICE_ACCOUNT_JSON_STAGING",
    appName: "quiz-arena-staging",
  },
};

function getProjectIdFromToken(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Invalid Firebase ID token.");
  let projectId;
  try {
    projectId = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).aud;
  } catch {
    throw new Error("Invalid Firebase ID token.");
  }
  if (!Object.prototype.hasOwnProperty.call(PROJECTS, projectId)) {
    throw new Error("Unsupported Firebase project.");
  }
  return projectId;
}

function getFirebaseAdmin(projectId = "quizarena-2c75e") {
  const project = PROJECTS[projectId];
  if (!project) throw new Error("Unsupported Firebase project.");
  const rawServiceAccount = process.env[project.serviceAccountEnv];
  if (!rawServiceAccount) {
    throw new Error("Firebase service account is not configured.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    throw new Error("Firebase service account is not valid JSON.");
  }
  if (serviceAccount.project_id !== projectId) {
    throw new Error("Firebase service account project does not match the request.");
  }

  const app = getApps().find((candidate) => candidate.name === project.appName)
    || initializeApp(
      { credential: cert(serviceAccount), projectId },
      project.appName === "[DEFAULT]" ? undefined : project.appName,
    );
  return {
    auth: getAuth(app),
    db: getFirestore(app),
    messaging: getMessaging(app),
    FieldPath,
    FieldValue,
    Timestamp,
  };
}

module.exports = { getFirebaseAdmin, getProjectIdFromToken };
