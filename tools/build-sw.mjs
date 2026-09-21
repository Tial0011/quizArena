#!/usr/bin/env node
/**
 * Regenerates the precache manifest inside sw.js.
 *
 *   node tools/build-sw.mjs
 *
 * Run it before every deploy. It (1) lists every css/js/icon file the app
 * needs, (2) finds every Firebase SDK URL the app imports from gstatic, and
 * (3) stamps a version made from the file contents -- so users' phones only
 * download a new copy when something actually changed.
 *
 * No dependencies; plain Node 18+.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const toUrl = (file) => "/" + relative(root, file).split(sep).join("/");

// index.html is served at "/" (not "/index.html": some hosts 301 that,
// and a redirected response can't be used for a page navigation).
const files = [
  ...walk(join(root, "css")).filter((f) => f.endsWith(".css")),
  ...walk(join(root, "js")).filter((f) => f.endsWith(".js")),
  join(root, "manifest.json"),
  join(root, "favicon.ico"),
  join(root, "icons", "favicon-16.png"),
  join(root, "icons", "favicon-32.png"),
  join(root, "icons", "favicon-48.png"),
  join(root, "icons", "apple-touch-icon.png"),
  join(root, "icons", "icon-192.png"), // notification icon + welcome screen
  // icon-512 / icon-maskable-512 are big and only the OS needs them at install time
].sort();

const urls = ["/", ...files.map(toUrl)];

// Firebase SDK entry points used by the app (SDK internals are discovered by sw.js itself).
const sdk = new Set();
for (const f of walk(join(root, "js")).filter((f) => f.endsWith(".js"))) {
  for (const m of readFileSync(f, "utf8").matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[\w.\-/]+\.js/g)) {
    sdk.add(m[0]);
  }
}
const cdn = [...sdk].sort();

const hash = createHash("sha1");
hash.update(readFileSync(join(root, "index.html")));
for (const f of files) hash.update(f).update(readFileSync(f));
cdn.forEach((u) => hash.update(u));
const version = hash.digest("hex").slice(0, 10);

const block =
  `/* <precache-manifest> */\n` +
  `const PRECACHE_VERSION = ${JSON.stringify(version)};\n` +
  `const PRECACHE_URLS = ${JSON.stringify(urls, null, 2)};\n` +
  `const PRECACHE_CDN = ${JSON.stringify(cdn, null, 2)};\n` +
  `/* </precache-manifest> */`;

const swPath = join(root, "sw.js");
const sw = readFileSync(swPath, "utf8");
const re = /\/\* <precache-manifest> \*\/[\s\S]*?\/\* <\/precache-manifest> \*\//;
if (!re.test(sw)) {
  console.error("Could not find the precache-manifest markers in sw.js");
  process.exit(1);
}
writeFileSync(swPath, sw.replace(re, block));
console.log(`sw.js updated: version ${version}, ${urls.length} files, ${cdn.length} Firebase SDK entries`);
