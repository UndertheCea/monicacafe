// Accessibility guards (#231): static checks on the source. Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

test(".label-caps is at least 12px", () => {
  const m = read("app/globals.css").match(/\.label-caps\s*\{[^}]*\}/);
  assert.ok(m, ".label-caps exists");
  assert.ok(/\btext-xs\b/.test(m[0]) || /text-\[(\d+(\.\d+)?)rem\]/.test(m[0]) && Number(m[0].match(/text-\[([\d.]+)rem\]/)[1]) >= 0.75, m[0]);
});

test("the sold-out archive greys the picture, not the whole card", () => {
  const page = read("app/shops/[slug]/page.tsx");
  assert.ok(!/opacity-\d+[^"]*grayscale|grayscale[^"]*opacity-\d+/.test(page), "no opacity + grayscale on the grid");
  assert.ok(!/className="[^"]*\bgrayscale\b/.test(page), "no grayscale utility on the card wrapper");
  assert.match(read("app/globals.css"), /\.archive-grid article > div:first-child/);
});

test("aria-live wraps only the count line on /coffees", () => {
  const src = read("app/coffees/page.tsx");
  const live = src.match(/<(\w+)[^>]*aria-live/g) ?? [];
  assert.deepEqual(live.map((s) => s.match(/<(\w+)/)[1]), ["p"]);
});

test("smooth scrolling is motion-safe only", () => {
  const css = read("app/globals.css");
  assert.match(css, /motion-safe:scroll-smooth/);
  assert.ok(!/(^|[\s"])scroll-smooth/m.test(css.replace(/motion-safe:scroll-smooth/g, "")));
});

test("icon buttons are at least 44px", () => {
  for (const f of ["components/NavDrawer.tsx", "components/SearchToggle.tsx", "components/Drawer.tsx", "components/dashboard/Dashboard.tsx"]) {
    assert.ok(!/\bh-(8|9) w-(8|9)\b/.test(read(f)), `${f} has a button under 44px`);
  }
});

test("the language toggle and wordmark declare their language", () => {
  assert.match(read("components/LanguageToggle.tsx"), /<span lang=/);
  assert.match(read("components/Wordmark.tsx"), /lang="en"/);
});
