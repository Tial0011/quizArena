// Recover Firestore documents from an interrupted staging load run.
// Auth users require their saved ID tokens and are intentionally not deleted here.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const manifestFile = resolve(process.argv[2] || "");
if (!manifestFile.toLowerCase().endsWith(".json") || !existsSync(manifestFile)) {
  throw new Error("Pass the exact load-test manifest JSON path.");
}
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
if (manifest.project !== "quiz-arena-staging" || !String(manifest.runId).match(/^[a-z0-9]+$/)) {
  throw new Error("Manifest is not for the expected staging project/run.");
}
const cliCandidates = [process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules", "firebase-tools")].filter(Boolean);
const firebaseToolsPath = cliCandidates.find(existsSync);
if (!firebaseToolsPath) throw new Error("Firebase CLI was not found.");
const requireFirebaseTools = createRequire(join(firebaseToolsPath, "package.json"));
const firebaseAuth = requireFirebaseTools("./lib/auth.js");
const firebaseScopes = requireFirebaseTools("./lib/scopes.js");

async function getOAuthToken() {
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI is not logged in; run firebase login:use for the staging account.");
  const tokens = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [firebaseScopes.CLOUD_PLATFORM]);
  return tokens.access_token;
}

const failures = [];
const oauthToken = await getOAuthToken();
for (let offset = 0; offset < manifest.docs.length; offset += 400) {
  const writes = manifest.docs.slice(offset, offset + 400).map((path) => ({
    delete: `projects/${manifest.project}/databases/(default)/documents/${path}`,
  }));
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${manifest.project}/databases/(default)/documents:batchWrite`, {
      method: "POST", headers: { authorization: `Bearer ${oauthToken}`, "content-type": "application/json" },
      body: JSON.stringify({ writes }), signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || `${response.status}`);
    (result.status || []).forEach((status, index) => { if (status.code) failures.push({ path: manifest.docs[offset + index], error: status.message || String(status.code) }); });
  } catch (error) { failures.push({ batchStart: offset, error: error.message }); }
}
for (let offset = 0; offset < manifest.users.length; offset += 1000) {
  const users = manifest.users.slice(offset, offset + 1000);
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${manifest.project}/accounts:batchDelete`;
    const response = await fetch(url, {
      method: "POST", headers: { authorization: `Bearer ${oauthToken}`, "content-type": "application/json" },
      body: JSON.stringify({ localIds: users.map((user) => user.uid), force: true }), signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || `${response.status}`);
    (result.errors || []).forEach((item) => failures.push({ user: users[item.index]?.uid, error: item.message || String(item.localId || "delete failed") }));
  } catch (error) { failures.push({ authBatchStart: offset, error: error.message }); }
}
console.log(JSON.stringify({ project: manifest.project, runId: manifest.runId, attemptedDocuments: manifest.docs.length, attemptedAuthUsers: manifest.users.length, failedItems: failures.length, failures: failures.slice(0, 20) }, null, 2));
if (failures.length) process.exitCode = 1;
