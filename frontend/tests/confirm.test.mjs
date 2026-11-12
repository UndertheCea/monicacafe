// One way to confirm a destructive action (#232): the inline ConfirmButton, never the browser's window.confirm.
// Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// The one remaining browser dialog: the "leave with unsaved changes?" guard on link clicks (#228). It has to answer
// synchronously inside the click to veto the navigation, so an inline ConfirmButton can't replace it, and it
// guards leaving a page, not a destructive action.
const ALLOWED = new Set(["components/dashboard/useSellerSession.ts"]);

const root = new URL("..", import.meta.url).pathname;

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

test("no window.confirm / confirm() in app/ or components/", () => {
  const offenders = [];
  for (const dir of ["app", "components"]) {
    for (const file of sources(join(root, dir))) {
      if (ALLOWED.has(relative(root, file))) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments may mention it
          if (/\bwindow\.confirm\b|(^|[^.\w])confirm\s*\(/.test(line)) {
            offenders.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
  }
  assert.deepEqual(offenders, [], `use <ConfirmButton> instead:\n${offenders.join("\n")}`);
});
