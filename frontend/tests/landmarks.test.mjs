// Landmarks (#85): the root layout owns the page's only <main id="main">, and
// a skip link to it comes before the header. Run with `npm test`.
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

test("only app/layout.tsx renders <main>", () => {
  const offenders = [...tsxFiles(join(root, "app")), ...tsxFiles(join(root, "components"))]
    .map((p) => relative(root, p))
    .filter((p) => p !== join("app", "layout.tsx"))
    .filter((p) => /<main[\s>]/.test(readFileSync(join(root, p), "utf8")));
  assert.deepEqual(offenders, [], "pages and components render a <div>; the layout owns <main>");
});

test("layout: skip link to #main before the header, one focusable <main id=main>", () => {
  const src = readFileSync(join(root, "app", "layout.tsx"), "utf8");
  const skip = src.indexOf('href="#main"');
  const header = src.indexOf("<SiteHeader");
  assert.ok(skip > 0 && skip < header, "skip link comes before <SiteHeader>");
  assert.match(src, /t\(locale, "a11y\.skipToMain"\)/, "skip link text is translated");
  assert.equal((src.match(/<main[\s>]/g) ?? []).length, 1);
  assert.match(src, /<main id="main" tabIndex=\{-1\}/);
});
