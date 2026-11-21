// Accessibility guards (#231): static checks on the source. Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

test("home shop cards use h3 under the Featured roasters h2; /shops keeps the h2 default (#429)", () => {
  assert.match(read("app/page.tsx"), /<ShopCard\b[^>]*headingLevel="h3"/);
  assert.doesNotMatch(read("app/shops/page.tsx"), /<ShopCard\b[^>]*headingLevel=/);
  assert.match(read("components/shops/ShopCard.tsx"), /headingLevel: Heading = "h2"/);
});

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

test("toggles that stay on screen use aria-disabled, not disabled, so focus is kept (#423)", () => {
  for (const f of ["components/coffees/SaveButton.tsx", "components/shops/FollowButton.tsx", "components/dashboard/CoffeeDetailsForm.tsx"]) {
    const src = read(f);
    assert.ok(!/(?<![-\w])disabled=\{/.test(src), `${f} has no disabled={...}`);
    assert.match(src, /aria-disabled=\{/, f);
  }
});

test("success messages sit in always-mounted role=status regions (#423)", () => {
  const account = read("components/account/AccountSettings.tsx");
  const details = read("components/dashboard/CoffeeDetailsForm.tsx");
  assert.ok(!/\{(saved|done) &&/.test(account));
  assert.ok(!/\{saveMsg &&/.test(details));
  assert.ok(!/note\?\.kind === "added" && \(\s*<p role="status"/.test(read("components/cart/AddToCart.tsx")));
});

test("in-page anchors land below the sticky header: one scroll-padding on html, no per-target scroll-mt (#451)", () => {
  assert.match(read("components/SiteHeader.tsx"), /sticky top-0/);
  assert.match(read("app/globals.css"), /html\s*\{[^}]*scroll-padding-top:\s*5rem/);
  for (const f of ["components/account/AccountSettings.tsx", "app/shops/[slug]/page.tsx"]) {
    assert.doesNotMatch(read(f), /scroll-mt-/, `${f}: scroll-mt would add to the html scroll-padding`);
  }
});
