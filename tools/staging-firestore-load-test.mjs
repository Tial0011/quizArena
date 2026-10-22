// Staging-only load test for the current weekly and group leaderboard reads.
// Usage: node tools/staging-firestore-load-test.mjs [users=400] [concurrency=25]
// Pass --keep only when investigating a failed run; the manifest can then be
// removed with the Firebase CLI after reviewing its exact paths.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const PROJECT_ID = "quiz-arena-staging";
const API_KEY = "AIzaSyDbSXf54cRPjZdyrdEKVmxpv7AHXY6__gY";
const args = process.argv.slice(2).filter((arg) => arg !== "--keep");
const KEEP = process.argv.includes("--keep");
const USER_COUNT = Math.max(5, Math.min(400, Number(args[0]) || 400));
const CONCURRENCY = Math.max(1, Math.min(USER_COUNT, Number(args[1]) || 25));
const GROUP_SIZE = 5;
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const DOCUMENT_ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const createdUsers = [];
const createdDocs = [];
const metrics = new Map();
const manifestDir = join(process.cwd(), "tools", "load-test-manifests");
const manifestPath = join(manifestDir, `${RUN_ID}.json`);
const firebaseToolsPath = process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules", "firebase-tools");
if (!firebaseToolsPath || !existsSync(firebaseToolsPath)) throw new Error("Firebase CLI credentials are required for staging setup and cleanup.");
const requireFirebaseTools = createRequire(join(firebaseToolsPath, "package.json"));
const firebaseAuth = requireFirebaseTools("./lib/auth.js");
const firebaseScopes = requireFirebaseTools("./lib/scopes.js");

function firestoreValue(value) {
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function documentFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

function recordCreated() {
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ project: PROJECT_ID, runId: RUN_ID, users: createdUsers.map(({ uid, idToken, email }) => ({ uid, idToken, email })), docs: createdDocs }, null, 2));
}

async function request(url, { method = "GET", token, body, label, allowNotFound = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const start = performance.now();
  let response;
  try {
    response = await fetch(url, { method, headers, signal: AbortSignal.timeout(20000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (label) {
      const entry = metrics.get(label) || { latencies: [], failures: 0, documents: 0, errors: [] };
      entry.latencies.push(performance.now() - start);
      if (!response.ok && !(allowNotFound && response.status === 404)) {
        entry.failures++;
        entry.errors.push(data?.error?.message || `${response.status} ${response.statusText}`);
      }
      else if (Array.isArray(data)) entry.documents += data.filter((row) => row.document).length;
      metrics.set(label, entry);
    }
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new Error(`${response.status}: ${data?.error?.message || response.statusText}`);
    return data;
  } catch (error) {
    if (label && !response) {
      const entry = metrics.get(label) || { latencies: [], failures: 0, documents: 0, errors: [] };
      entry.latencies.push(performance.now() - start);
      entry.failures++;
      entry.errors.push(error.message);
      metrics.set(label, entry);
    }
    throw error;
  }
}

async function getOAuthToken() {
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI is not logged in; select the staging account first.");
  const tokens = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [firebaseScopes.CLOUD_PLATFORM]);
  return tokens.access_token;
}

async function writeDocsWithAdmin(collection, entries, oauthToken) {
  const docs = entries.map(({ id, data }) => {
    const path = `${collection}/${id}`;
    if (!createdDocs.includes(path)) createdDocs.push(path);
    return { path, write: { update: { name: `${DOCUMENT_ROOT}/${path}`, fields: documentFields(data) } } };
  });
  recordCreated();
  for (let offset = 0; offset < docs.length; offset += 400) {
    const batch = docs.slice(offset, offset + 400);
    const response = await fetch(`${BASE}:batchWrite`, {
      method: "POST", headers: { authorization: `Bearer ${oauthToken}`, "content-type": "application/json" },
      body: JSON.stringify({ writes: batch.map((item) => item.write) }), signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || `${response.status}`);
    const failed = (result.status || []).find((status) => status.code);
    if (failed) throw new Error(`Firestore batch write failed: ${failed.message || failed.code}`);
  }
}

function currentWeekBounds() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (name) => Number(parts.find((item) => item.type === name).value);
  const monday = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekStart = new Date(monday.getTime() - 3600000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000 - 1);
  const jan = Date.UTC(monday.getUTCFullYear(), 0, 1);
  const weekNumber = Math.ceil(((monday.getTime() - jan) / 86400000 + new Date(jan).getUTCDay() + 1) / 7);
  return { weekStart, weekEnd, weekKey: `${monday.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}` };
}

function structuredQuery(collectionId, where) {
  return { structuredQuery: { from: [{ collectionId }], ...(where ? { where } : {}) } };
}

function rangeFilter(field, start, end) {
  return { compositeFilter: { op: "AND", filters: [
    { fieldFilter: { field: { fieldPath: field }, op: "GREATER_THAN_OR_EQUAL", value: firestoreValue(start) } },
    { fieldFilter: { field: { fieldPath: field }, op: "LESS_THAN_OR_EQUAL", value: firestoreValue(end) } },
  ] } };
}

async function readAllAttempts(token, bounds) {
  return request(`${BASE}:runQuery`, { method: "POST", token, body: structuredQuery("attempts", rangeFilter("completedAt", bounds.weekStart, bounds.weekEnd)), label: "leaderboard-weekly-attempts" });
}

async function readScores(token, bounds, groups) {
  const ids = [...new Set(groups.flatMap((group) => group.memberIds))].map((uid) => `${bounds.weekKey}_${uid}`);
  const batches = [];
  for (let offset = 0; offset < ids.length; offset += 30) {
    batches.push(request(`${BASE}:runQuery`, {
      method: "POST", token,
      body: structuredQuery("weeklyChallengeScores", { fieldFilter: {
        field: { fieldPath: "__name__" }, op: "IN",
        value: { arrayValue: { values: ids.slice(offset, offset + 30).map((id) => ({ referenceValue: `${BASE}/${"weeklyChallengeScores"}/${id}` })) } },
      } }),
      label: "leaderboard-weekly-scores",
    }));
  }
  return Promise.all(batches);
}

async function readProfiles(token, userIds) {
  const batches = [];
  for (let offset = 0; offset < userIds.length; offset += 30) {
    const ids = userIds.slice(offset, offset + 30);
    batches.push(request(`${BASE}:runQuery`, { method: "POST", token, body: structuredQuery("users", {
      fieldFilter: { field: { fieldPath: "__name__" }, op: "IN", value: { arrayValue: { values: ids.map((uid) => ({ referenceValue: `${BASE}/users/${uid}` })) } } },
    }), label: "leaderboard-profiles" }));
  }
  return Promise.all(batches);
}

async function loadGroupDetails(token, group) {
  const reads = group.memberIds.flatMap((uid) => [
    request(`${BASE}/users/${uid}`, { token, label: "group-member-profile" }),
    request(`${BASE}:runAggregationQuery`, { method: "POST", token, body: {
      structuredAggregationQuery: {
        structuredQuery: structuredQuery("attempts", { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: firestoreValue(uid) } }).structuredQuery,
        aggregations: [
          { alias: "attemptCount", count: {} },
          { alias: "averagePercentage", avg: { field: { fieldPath: "percentage" } } },
        ],
      },
    }, label: "group-member-attempt-aggregate" }),
  ]);
  return Promise.allSettled(reads);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
}

function summarizeMetrics() {
  return Object.fromEntries([...metrics].map(([name, entry]) => [name, {
    requests: entry.latencies.length, failures: entry.failures, returnedDocuments: entry.documents,
    errors: [...new Set(entry.errors)].slice(0, 3),
    latencyMs: { p50: percentile(entry.latencies, 0.5), p95: percentile(entry.latencies, 0.95), p99: percentile(entry.latencies, 0.99) },
  }]));
}

async function cleanup() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "tools", "cleanup-staging-load-test.mjs"), manifestPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return resolve([stderr.trim() || stdout.trim() || `Cleanup exited ${code}`]);
      resolve([]);
    });
  });
}

async function main() {
  const bounds = currentWeekBounds();
  const startedAt = Date.now();
  let measurement = null;
  console.log(`Staging-only Firestore load: ${USER_COUNT} sessions, concurrency ${CONCURRENCY}, ${bounds.weekKey}.`);
  console.log("Creating isolated Firestore data for 400 synthetic leaderboard sessions...");

  try {
    const oauthToken = await getOAuthToken();
    const syntheticUsers = Array.from({ length: USER_COUNT }, (_, index) => ({
      uid: `load_${RUN_ID}_${index}`,
      email: `qa-load-${RUN_ID}-${index}@example.invalid`,
    }));
    await writeDocsWithAdmin("users", syntheticUsers.map((user, index) => ({ id: user.uid, data: {
      name: `Load Test ${String(index + 1).padStart(3, "0")}`, email: user.email,
      role: "student", purchasedQuizzes: [], createdAt: new Date(),
    } })), oauthToken);

    const groups = [];
    for (let offset = 0, groupIndex = 0; offset < syntheticUsers.length; offset += GROUP_SIZE, groupIndex++) {
      const members = syntheticUsers.slice(offset, offset + GROUP_SIZE);
      if (members.length < 3) continue;
      const group = { id: `loadtest_${RUN_ID}_${groupIndex}`, ownerId: members[0].uid, memberIds: members.map((user) => user.uid) };
      groups.push(group);
    }
    await writeDocsWithAdmin("friendGroups", groups.map((group, index) => ({ id: group.id, data: {
      name: `Load Test Group ${index + 1}`, code: `LT${RUN_ID.slice(-4)}${String(index).padStart(2, "0")}`,
      ownerId: group.ownerId, ownerName: `Load Test ${index * GROUP_SIZE + 1}`,
      memberIds: group.memberIds, createdAt: new Date(),
    } })), oauthToken);

    console.log(`Writing ${USER_COUNT} synthetic weekly purchased attempts...`);
    await writeDocsWithAdmin("attempts", syntheticUsers.map((user, index) => ({ id: `loadtest_${RUN_ID}_${index}`, data: {
      runId: RUN_ID, userId: user.uid, mode: "purchased", subjectName: "Load Test",
      quizId: `loadtest-quiz-${index % 8}`, quizTitle: "Load Test Quiz", score: 8,
      totalQuestions: 10, percentage: 80, completedAt: new Date(),
    } })), oauthToken);

    // Owner credentials are valid for Firestore reads as all signed-in users
    // can read groups, attempts, and leaderboard profiles.
    const wallStart = performance.now();
    let cursor = 0;
    const sessions = Array.from({ length: USER_COUNT }, (_, index) => index);
    let failedSessions = 0;
    let projectionSessions = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < sessions.length) {
        const index = cursor++;
        const group = groups[Math.floor(index / GROUP_SIZE)];
        const userToken = oauthToken;
        try {
          const topIds = syntheticUsers.slice(0, 15).map((user) => user.uid);
          const marker = await request(`${BASE}/weeklyChallengeProjection/${bounds.weekKey}`, { token: userToken, label: "projection-marker", allowNotFound: true });
          const projectionReady = marker?.fields?.ready?.booleanValue === true;
          if (projectionReady) {
            projectionSessions++;
            await Promise.all([readScores(userToken, bounds, groups), readProfiles(userToken, topIds)]);
          } else {
            await Promise.all([readAllAttempts(userToken, bounds), request(`${BASE}:runQuery`, { method: "POST", token: userToken, body: structuredQuery("friendGroups"), label: "global-friend-groups" }), readProfiles(userToken, topIds)]);
          }
          await loadGroupDetails(userToken, group);
        } catch { failedSessions++; }
      }
    }));
    measurement = {
      project: PROJECT_ID, runId: RUN_ID, weekKey: bounds.weekKey,
      projectionSessions, fallbackSessions: USER_COUNT - projectionSessions,
      authContext: "Firebase CLI OAuth; 400 concurrent query sessions share the test identity",
      simulatedSessions: USER_COUNT, concurrency: CONCURRENCY, failedSessions,
      wallTimeMs: Math.round(performance.now() - wallStart), firestoreRestMetrics: summarizeMetrics(),
    };
  } finally {
    console.log(KEEP ? `Keeping synthetic resources. Manifest: ${manifestPath}` : "Cleaning up synthetic staging resources...");
    const cleanupErrors = KEEP ? [] : await cleanup();
    if (!KEEP && cleanupErrors.length === 0) {
      try { (await import("node:fs")).unlinkSync(manifestPath); } catch {}
    }
    if (measurement) console.log(JSON.stringify({ ...measurement, cleanupErrors: cleanupErrors.length, cleanupDetails: cleanupErrors.slice(0, 10), totalSeconds: Math.round((Date.now() - startedAt) / 1000) }, null, 2));
    else console.log(JSON.stringify({ runId: RUN_ID, cleanupErrors: cleanupErrors.length, cleanupDetails: cleanupErrors.slice(0, 10), manifest: cleanupErrors.length ? manifestPath : undefined }, null, 2));
    if (cleanupErrors.length || (measurement && measurement.failedSessions)) process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(`Staging load test failed: ${error.message}`);
  process.exitCode = 1;
});
