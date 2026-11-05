// Seller-form validation helpers (lib/dashboard/validate.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coffeeDetailsPatch,
  coffeeDetailsProblem,
  inTaiwan,
  normaliseShopSlug,
  parseCoords,
  parseFlavorNotes,
  parseWhole,
  shopProfilePatch,
  shopProfileProblem,
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

const ROASTS = ["LIGHT", "MEDIUM", "MEDIUM_DARK", "DARK"];
const baseCoffee = {
  name: "Kochere",
  description: "Floral",
  originCountryId: "o1",
  processingMethodId: "p1",
  varietyId: "v1",
  roastLevel: "LIGHT",
  flavorNotes: ["Jasmine", "Peach"],
};

test("coffeeDetailsProblem", () => {
  const cases = [
    [{}, null],
    [{ name: "  " }, "required"],
    [{ originCountryId: "" }, "required"],
    [{ processingMethodId: "" }, "required"],
    [{ roastLevel: "BURNT" }, "required"],
    [{ varietyId: null }, null],
    [{ name: "咖".repeat(121) }, "required"],
    [{ flavorNotes: Array.from({ length: 11 }, (_, i) => `n${i}`) }, "notes"],
    [{ flavorNotes: ["香".repeat(31)] }, "notes"],
    [{ flavorNotes: ["香".repeat(30)] }, null],
  ];
  for (const [patch, want] of cases) {
    assert.equal(coffeeDetailsProblem({ ...baseCoffee, ...patch }, ROASTS), want, JSON.stringify(patch));
  }
});

test("coffeeDetailsPatch sends only changed fields", () => {
  const cases = [
    [{}, {}],
    [{ name: " Kochere " }, {}],
    [{ name: "Kochere G1" }, { name: "Kochere G1" }],
    [{ description: "Floral and bright" }, { description: "Floral and bright" }],
    [{ roastLevel: "MEDIUM", originCountryId: "o2" }, { roastLevel: "MEDIUM", originCountryId: "o2" }],
    [{ varietyId: "v2" }, { varietyId: "v2" }],
    [{ varietyId: null }, { clearVariety: true }],
    [{ flavorNotes: ["Peach", "Jasmine"] }, { flavorNotes: ["Peach", "Jasmine"] }],
    [{ flavorNotes: [] }, { flavorNotes: [] }],
  ];
  for (const [patch, want] of cases) {
    assert.deepEqual(coffeeDetailsPatch(baseCoffee, { ...baseCoffee, ...patch }), want, JSON.stringify(patch));
  }
  // Setting a variety on a coffee that had none.
  assert.deepEqual(coffeeDetailsPatch({ ...baseCoffee, varietyId: null }, { ...baseCoffee, varietyId: "v1" }), { varietyId: "v1" });
});

test("parseCoords", () => {
  const cases = [
    ["", "", "empty"],
    ["  ", " ", "empty"],
    ["25.033", "", "invalid"],
    ["", "121.5654", "invalid"],
    ["abc", "121", "invalid"],
    ["25.0", "121.", "invalid"],
    ["91", "121", "invalid"],
    ["25", "-181", "invalid"],
    ["25.0339639", " 121.5644722 ", { lat: 25.033964, lng: 121.564472 }],
    ["-33.8688", "151.2093", { lat: -33.8688, lng: 151.2093 }],
  ];
  for (const [lat, lng, want] of cases) assert.deepEqual(parseCoords(lat, lng), want, `${lat},${lng}`);
});

test("inTaiwan", () => {
  const cases = [
    [{ lat: 25.034, lng: 121.565 }, true], // Taipei 101
    [{ lat: 22.0, lng: 120.75 }, true], // Kenting
    [{ lat: 23.57, lng: 119.58 }, true], // Penghu
    [{ lat: 24.43, lng: 118.32 }, true], // Kinmen
    [{ lat: 26.16, lng: 119.95 }, true], // Matsu
    [{ lat: 35.68, lng: 139.69 }, false], // Tokyo
    [{ lat: 121.5, lng: 25.0 }, false], // swapped
    [{ lat: 0, lng: 0 }, false],
  ];
  for (const [c, want] of cases) assert.equal(inTaiwan(c), want, JSON.stringify(c));
});

const baseShop = { name: "山嵐烘焙", description: "", city: "台北市", lat: 25.03, lng: 121.56 };

test("shopProfileProblem", () => {
  const cases = [
    [{}, null],
    [{ name: " " }, "required"],
    [{ city: "" }, "required"],
    [{ name: "店".repeat(81) }, "name"],
    [{ description: "字".repeat(2001) }, "description"],
    [{ city: "市".repeat(41) }, "city"],
    [{ lat: null }, "coords"],
    [{ lat: null, lng: null }, null],
  ];
  for (const [patch, want] of cases) assert.equal(shopProfileProblem({ ...baseShop, ...patch }), want, JSON.stringify(patch));
});

test("shopProfilePatch", () => {
  const cases = [
    [{}, {}],
    [{ name: " 山嵐烘焙 " }, {}],
    [{ name: "山嵐", city: "新北市" }, { name: "山嵐", city: "新北市" }],
    [{ description: "淺焙專門" }, { description: "淺焙專門" }],
    [{ lat: 25.04 }, { lat: 25.04, lng: 121.56 }],
    [{ lng: 121.6 }, { lat: 25.03, lng: 121.6 }],
    [{ lat: null, lng: null }, {}],
  ];
  for (const [patch, want] of cases) assert.deepEqual(shopProfilePatch(baseShop, { ...baseShop, ...patch }), want, JSON.stringify(patch));
  // First location for a shop that had none.
  assert.deepEqual(
    shopProfilePatch({ ...baseShop, lat: null, lng: null }, { ...baseShop, lat: 22.6, lng: 120.3 }),
    { lat: 22.6, lng: 120.3 },
  );
});
