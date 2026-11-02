const { getFirebaseAdmin, getProjectIdFromToken } = require("./firebaseAdmin");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function getBearerToken(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization;
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

async function authenticate(event) {
  const token = getBearerToken(event);
  if (!token) return { error: json(401, { message: "Please sign in again." }) };

  let projectId;
  try {
    projectId = getProjectIdFromToken(token);
  } catch {
    return { error: json(401, { message: "Your session is invalid. Please sign in again." }) };
  }
  let admin;
  try {
    admin = getFirebaseAdmin(projectId);
  } catch (error) {
    console.error("Firebase Admin initialization failed:", error);
    return { error: json(503, { message: "The service is temporarily unavailable. Please try again." }) };
  }
  try {
    return { user: await admin.auth.verifyIdToken(token), admin };
  } catch {
    return { error: json(401, { message: "Your session has expired. Please sign in again." }) };
  }
}

function methodNotAllowed(event, methods = "POST, OPTIONS") {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { Allow: methods }, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Method not allowed." });
  }
  return null;
}

module.exports = { authenticate, json, methodNotAllowed };
