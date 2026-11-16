// Every role="progressbar" element has an accessible name (#335). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

function tsxFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("every role=progressbar element has aria-label or aria-labelledby", () => {
  const offenders = [];
  let seen = 0;
  for (const file of [...tsxFiles(join(root, "app")), ...tsxFiles(join(root, "components"))]) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/<[A-Za-z][^<>]*?role=["']progressbar["'][\s\S]*?>/g)) {
      seen++;
      if (!/aria-label(ledby)?=/.test(m[0])) offenders.push(relative(root, file));
    }
  }
  assert.ok(seen > 0, "expected at least one progressbar (the image uploader)");
  assert.deepEqual(offenders, [], "name each progressbar with aria-label or aria-labelledby");
});
