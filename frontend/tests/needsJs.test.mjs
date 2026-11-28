import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Pages whose client component shows only a loading line until the session is
// known must say they need JavaScript when it never runs (#570).
const pages = ["app/cart/page.tsx", "app/account/page.tsx", "app/dashboard/page.tsx", "app/admin/page.tsx"];

test("signed-in-only pages render the <noscript> notice", () => {
  for (const p of pages) {
    const src = readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
    assert.match(src, /<NeedsJs locale=\{locale\} \/>/, `${p} lacks <NeedsJs>`);
  }
});

test("NeedsJs is a <noscript>", () => {
  const src = readFileSync(new URL("../components/NeedsJs.tsx", import.meta.url), "utf8");
  assert.match(src, /<noscript>[\s\S]*common\.needsJs[\s\S]*<\/noscript>/);
});
