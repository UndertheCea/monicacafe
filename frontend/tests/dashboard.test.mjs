// Seller-form validation helpers (lib/dashboard/validate.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normaliseShopSlug,
  parseFlavorNotes,
  parseWhole,
  suggestSlug,
  variantProblems,
} from "../lib/dashboard/validate.ts";

test("normaliseShopSlug mirrors the backend rule", () => {
  const cases = [
    ["mountain-roast", "mountain-roast"],
    ["  Mountain-Roast ", "mountain-roast"],
    ["ab", null],
    ["a".repeat(49), null],
    ["double--hyphen", null],
    ["-leading", null],
    ["trailing-", null],
    ["山嵐", null],
    ["shop_1", null],
    ["roast42", "roast42"],
  ];
  for (const [input, want] of cases) assert.equal(normaliseShopSlug(input), want, input);
});

test("suggestSlug", () => {
  const cases = [
    ["Mountain Mist Roastery", "mountain-mist-roastery"],
    ["Café Lumière!", "cafe-lumiere"],
    ["山嵐烘焙", ""],
    ["山嵐 Roasters 台北", "roasters"],
  ];
  for (const [input, want] of cases) assert.equal(suggestSlug(input), want, input);
});

test("parseFlavorNotes", () => {
  assert.deepEqual(parseFlavorNotes("茉莉花, 柑橘、Jasmine，jasmine\n 蜂蜜 ,,"), ["茉莉花", "柑橘", "Jasmine", "蜂蜜"]);
  assert.deepEqual(parseFlavorNotes("  "), []);
});

test("parseWhole rejects decimals and out-of-range values", () => {
  const cases = [
    ["450", 0, 10, null],
    ["450", 0, 1000, 450],
    ["0", 0, 1000, 0],
    ["0", 1, 1000, null],
    ["4.5", 0, 1000, null],
    ["-1", 0, 1000, null],
    ["", 0, 1000, null],
    [" 12 ", 0, 1000, 12],
    ["1e3", 0, 10000, null],
  ];
  for (const [s, min, max, want] of cases) assert.equal(parseWhole(s, min, max), want, `${s} in [${min},${max}]`);
});

test("variantProblems", () => {
  const ok = { grind: "WHOLE_BEAN", weightG: "200", priceTwd: "450", stock: "3" };
  const problems = variantProblems([
    ok,
    { ...ok, grind: "FINE" },
    { ...ok, weightG: "0" },
    { ...ok, weightG: "250", priceTwd: "4.5" },
    { ...ok, weightG: "300", stock: "-2" },
    { ...ok }, // duplicate of row 0
  ]);
  assert.deepEqual([...problems.entries()], [
    [2, "weight"],
    [3, "price"],
    [4, "stock"],
    [5, "duplicate"],
  ]);
});
