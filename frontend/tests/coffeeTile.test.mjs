// Colour tiles for coffees without a photo (#111). Run with `npm test`.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RADIX_TILES, TILE_HUES, TILE_STEPS, coffeeTile, tileLines } from "../lib/coffeeTile.ts";

const root = new URL("..", import.meta.url).pathname;

// WCAG relative luminance / contrast.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("every hue has exactly steps 4–8, as hex colours", () => {
  assert.deepEqual([...TILE_STEPS], [4, 5, 6, 7, 8]);
  assert.ok(TILE_HUES.length >= 12, "enough hues that neighbours usually differ");
  for (const hue of TILE_HUES) {
    assert.equal(RADIX_TILES[hue].length, TILE_STEPS.length, hue);
    for (const c of RADIX_TILES[hue]) assert.match(c, /^#[0-9a-f]{6}$/, hue);
  }
});

test("black text on every tile colour meets WCAG AA (4.5:1)", () => {
  for (const hue of TILE_HUES) {
    for (const c of RADIX_TILES[hue]) assert.ok(contrast(c, "#111111") >= 4.5, `${hue} ${c}`);
  }
});

test("coffeeTile is deterministic and only returns steps 4–8 of a known hue", () => {
  const ids = ["00000000-0000-0000-0000-000000000000", "a1b2c3d4-0000-4000-8000-000000000001", "", "x"];
  for (let i = 0; i < 200; i++) ids.push(randomUUID());
  for (const id of ids) {
    const a = coffeeTile(id);
    assert.deepEqual(coffeeTile(id), a, "same id, same colour");
    assert.ok(TILE_HUES.includes(a.hue), a.hue);
    assert.ok(TILE_STEPS.includes(a.step), String(a.step));
    assert.equal(a.background, RADIX_TILES[a.hue][a.step - 4]);
  }
});

test("coffeeTile spreads ids over every hue and step", () => {
  const hues = new Map();
  const steps = new Map();
  const n = 5000;
  for (let i = 0; i < n; i++) {
    const { hue, step } = coffeeTile(randomUUID());
    hues.set(hue, (hues.get(hue) ?? 0) + 1);
    steps.set(step, (steps.get(step) ?? 0) + 1);
  }
  assert.equal(hues.size, TILE_HUES.length, "every hue used");
  assert.equal(steps.size, TILE_STEPS.length, "every step used");
  const fairHue = n / TILE_HUES.length;
  for (const [hue, count] of hues) assert.ok(count < fairHue * 1.5 && count > fairHue * 0.5, `${hue}: ${count}`);
  // Sequential-looking ids (seed data) still differ from their neighbours most of the time.
  let same = 0;
  for (let i = 0; i < 100; i++) {
    const a = coffeeTile(`00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    const b = coffeeTile(`00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);
    if (a.background === b.background) same++;
  }
  assert.ok(same < 10, `neighbours with the same colour: ${same}`);
});

test("tileLines: variety · process, then origin; blanks dropped", () => {
  const cases = [
    [{ variety: "Geisha", process: "Natural", origin: "巴拿馬" }, ["Geisha · Natural", "巴拿馬"]],
    [{ variety: null, process: "Washed", origin: "Ethiopia" }, ["Washed", "Ethiopia"]],
    [{ variety: "  ", process: "", origin: "Kenya" }, ["Kenya"]],
    [{}, []],
  ];
  for (const [parts, want] of cases) assert.deepEqual(tileLines(parts), want, JSON.stringify(parts));
});

test("no ☕ placeholder is left on coffee surfaces; the tile is used instead", () => {
  for (const f of [
    "components/coffees/CoffeeCard.tsx",
    "components/coffees/PhotoGallery.tsx",
    "components/account/SavedCoffees.tsx",
    "components/dashboard/Dashboard.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(join(root, f), "utf8"), /☕/, f);
  }
  for (const f of ["components/coffees/CoffeeCard.tsx", "components/coffees/CoffeeDetailView.tsx", "components/account/SavedCoffees.tsx", "components/dashboard/Dashboard.tsx"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /<CoffeeTile\b/, f);
  }
  const tile = readFileSync(join(root, "components/coffees/CoffeeTile.tsx"), "utf8");
  assert.doesNotMatch(tile, /dangerouslySetInnerHTML/, "seller text is JSX text");
});
