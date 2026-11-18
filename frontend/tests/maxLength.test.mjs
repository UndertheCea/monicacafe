// Text inputs must not use native maxLength for limits counted in characters (#395): it counts UTF-16 units, so
// 𠮷 or an emoji uses two and a 30-character name stops at 25, while the API counts characters (runes).
// Such fields validate by rune count (lib/dashboard/validate.ts, lib/auth/token.ts) or are cut by
// capChars/capInput (lib/textInput.ts). Allowed: ASCII-only fields (shop slug, harvest year digits) and search boxes.
// Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

// Allowed: ASCII-only literals (slug 48, year 4) and search boxes (cut by code points in lib/coffeeQuery.ts anyway).
const ALLOWED = [/maxLength=\{48\}/, /maxLength=\{4\}/, /maxLength=\{SEARCH_MAX_CHARS\}/, /maxLength=\{100\}/];

test("no native maxLength on character-limited fields", () => {
  const offenders = [];
  for (const dir of ["app", "components"]) {
    for (const file of sources(join(root, dir))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/maxLength=/.test(line) || ALLOWED.some((re) => re.test(line))) return;
          offenders.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
        });
    }
  }
  assert.deepEqual(offenders, [], "use rune-aware validation or capChars instead of maxLength");
});
