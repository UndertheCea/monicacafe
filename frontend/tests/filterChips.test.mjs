// Active-filter chips (lib/filterChips.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeFilterCount, filterChips, hrefWithout, priceChipLabel } from "../lib/filterChips.ts";

test("hrefWithout drops the named params and page, keeps the rest", () => {
  const cases = [
    [{ roast: "light", q: "kenya", sort: "saved", page: "3" }, ["roast"], "/coffees?q=kenya&sort=saved"],
    [{ roast: "light" }, ["roast"], "/coffees"],
    [{ min: "300", max: "600", instock: "1" }, ["min", "max"], "/coffees?instock=1"],
    [{ q: ["a", "b"], body: " full " }, [], "/coffees?q=a&body=full"],
    [{ q: "", roast: undefined }, [], "/coffees"],
  ];
  for (const [sp, drop, want] of cases) {
    assert.equal(hrefWithout("/coffees", sp, drop), want, JSON.stringify(sp));
  }
  assert.equal(hrefWithout("/shops/demo", { sweet: "high", roast: "dark" }, ["sweet"]), "/shops/demo?roast=dark");
});

test("filterChips: one chip per filter, each link removes only it", () => {
  const sp = {
    q: "geisha",
    sort: "price_asc",
    page: "2",
    origin: "o1",
    variety: "v1",
    process: "p1",
    min: "300",
    max: "900",
    instock: "1",
  };
  const f = {
    search: "geisha",
    originCountryId: "o1",
    varietyId: "v1",
    processingMethodId: "p1",
    minPriceTwd: 300,
    maxPriceTwd: 900,
    inStock: true,
  };
  const chips = filterChips(f, sp, "/coffees");
  assert.deepEqual(
    chips.map((c) => c.kind),
    ["origin", "variety", "process", "price", "instock"],
  );
  const removes = {
    origin: ["origin"],
    variety: ["variety"],
    process: ["process"],
    price: ["min", "max"],
    instock: ["instock"],
  };
  for (const c of chips) {
    const u = new URL(c.href, "http://x");
    assert.equal(u.pathname, "/coffees");
    assert.equal(u.searchParams.get("q"), "geisha", c.kind);
    assert.equal(u.searchParams.get("sort"), "price_asc", c.kind);
    assert.equal(u.searchParams.has("page"), false, c.kind);
    for (const k of Object.keys(sp)) {
      if (k === "page") continue;
      assert.equal(u.searchParams.has(k), !removes[c.kind].includes(k), `${c.kind} → ${k}`);
    }
  }
});

test("filterChips: nothing active → no chips; search and sort aren't chips", () => {
  assert.deepEqual(filterChips({}, {}, "/coffees"), []);
  assert.deepEqual(filterChips({ search: "x" }, { q: "x", sort: "saved" }, "/coffees"), []);
});

test("filterChips: API-only filters (roast, brew, …) never make chips (#166)", () => {
  const f = { roastLevel: "LIGHT", brewMethod: "FILTER", flavorNote: "x", minHarvestYear: 2025, minAltitudeM: 1500 };
  assert.deepEqual(filterChips(f, {}, "/coffees"), []);
});

test("filterChips: a price floor only, and another base", () => {
  const chips = filterChips({ minPriceTwd: 500, inStock: true }, { min: "500", instock: "1" }, "/shops/demo-roastery");
  assert.deepEqual(
    chips.map((c) => [c.kind, c.href]),
    [
      ["price", "/shops/demo-roastery?instock=1"],
      ["instock", "/shops/demo-roastery?min=500"],
    ],
  );
});

test("priceChipLabel picks range, floor or ceiling", () => {
  assert.deepEqual(priceChipLabel(300, 900), { key: "chip.priceRange", vars: { min: 300, max: 900 } });
  assert.deepEqual(priceChipLabel(300, undefined), { key: "chip.priceMin", vars: { min: 300 } });
  assert.deepEqual(priceChipLabel(undefined, 900), { key: "chip.priceMax", vars: { max: 900 } });
  assert.deepEqual(priceChipLabel(0, undefined), { key: "chip.priceMin", vars: { min: 0 } });
});

test("activeFilterCount counts filters, not search or sort; price once", () => {
  const cases = [
    [{}, 0],
    [{ search: "kenya" }, 0],
    [{ roastLevel: "DARK" }, 0],
    [{ minPriceTwd: 100, maxPriceTwd: 500 }, 1],
    [{ originCountryId: "o", varietyId: "v", processingMethodId: "p", inStock: true, minAltitudeM: 1500 }, 4],
    [{ inStock: false }, 0],
  ];
  for (const [f, want] of cases) assert.equal(activeFilterCount(f), want, JSON.stringify(f));
});
