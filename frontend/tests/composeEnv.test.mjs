// Every env var the frontend reads at run time reaches its container (#496).
// Run with `npm test`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

// Read at build time (inlined or used by `next build`), or set by the image.
const BUILD_TIME = new Set(["NODE_ENV", "NEXT_PUBLIC_GRAPHQL_URL", "SOURCE_COMMIT"]);

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Keys of the compose frontend service's `environment:` block. */
function frontendEnvKeys(compose) {
  const lines = compose.split("\n");
  const svc = lines.findIndex((l) => l === "  frontend:");
  assert.ok(svc >= 0, "compose has a frontend service");
  const keys = new Set();
  let inEnv = false;
  for (const l of lines.slice(svc + 1)) {
    if (/^ {2}\S/.test(l)) break; // next service
    if (/^ {4}\S/.test(l)) inEnv = l.trim() === "environment:";
    else if (inEnv) {
      const m = /^ {6}([A-Z0-9_]+):/.exec(l);
      if (m) keys.add(m[1]);
    }
  }
  return keys;
}

test("the compose frontend service passes every run-time env var the frontend reads", () => {
  const files = [
    ...["app", "lib", "components"].flatMap((d) => sources(join(root, d))),
    join(root, "proxy.ts"),
    join(root, "instrumentation.ts"),
  ];
  const read = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(m[1]);
  }
  assert.ok(read.has("SITE_URL") && read.has("APP_ENV"), "the scan finds the frontend's env reads");
  const passed = frontendEnvKeys(readFileSync(join(root, "..", "docker-compose.yml"), "utf8"));
  const missing = [...read].filter((k) => !BUILD_TIME.has(k) && !passed.has(k)).sort();
  assert.deepEqual(missing, [], "add these to the frontend service's environment in docker-compose.yml");
});
