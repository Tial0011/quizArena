import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const clients = Math.max(1, Number(process.argv[2]) || 500);
const concurrency = Math.min(clients, 100);
const assets = ["/", "/js/boot.js", "/js/main.js", "/css/base.css", "/css/auth.css"];
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const durations = [];
let requestCount = 0;
let failures = 0;

try {
  const wallStart = performance.now();
  let nextClient = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextClient < clients) {
      nextClient++;
      const start = performance.now();
      for (const asset of assets) {
        try {
          const response = await fetch(`${baseUrl}${asset}`);
          requestCount++;
          if (!response.ok) failures++;
          await response.arrayBuffer();
        } catch {
          failures++;
        }
      }
      durations.push(performance.now() - start);
    }
  });
  await Promise.all(workers);
  const wallMs = performance.now() - wallStart;
  durations.sort((a, b) => a - b);
  const percentile = (p) => Math.round(durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] || 0);
  console.log(JSON.stringify({
    scope: "local static HTTP only; does not exercise Firebase/Auth/Firestore or browser rendering",
    simulatedConcurrentClients: clients,
    maxConcurrentSessions: concurrency,
    requests: requestCount,
    failures,
    wallTimeMs: Math.round(wallMs),
    requestsPerSecond: Math.round(requestCount / (wallMs / 1000)),
    sessionLatencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
  }, null, 2));
  if (failures) process.exitCode = 1;
} finally {
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
