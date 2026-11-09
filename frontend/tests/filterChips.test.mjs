// Active-filter chips (lib/filterChips.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { filterChips, hrefWithout, priceChipLabel } from "../lib/filterChips.ts";

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
    roast: "light",
    brew: "filter",
    flavor: "jasmine",
    min: "300",
    max: "900",
    instock: "1",
    harvest: "recent",
    acidity: "low",
    sweet: "high",
    altitude: "high",
    body: "full",
  };
  const f = {
    search: "geisha",
    originCountryId: "o1",
    varietyId: "v1",
    processingMethodId: "p1",
    roastLevel: "LIGHT",
    brewMethod: "FILTER",
    flavorNote: "jasmine",
    minPriceTwd: 300,
    maxPriceTwd: 900,
    inStock: true,
    minHarvestYear: 2025,
    maxAcidity: 2,
    minSweetness: 4,
    minAltitudeM: 1500,
    minBody: 4,
  };
  const chips = filterChips(f, sp, "/coffees");
  assert.deepEqual(
    chips.map((c) => c.kind),
    ["origin", "variety", "process", "roast", "brew", "flavor", "price", "instock", "harvest", "acidity", "sweet", "altitude", "body"],
  );
  const removes = {
    origin: ["origin"],
    variety: ["variety"],
    process: ["process"],
    roast: ["roast"],
    brew: ["brew"],
    flavor: ["flavor"],
    price: ["min", "max"],
    instock: ["instock"],
    harvest: ["harvest"],
    acidity: ["acidity"],
    sweet: ["sweet"],
    altitude: ["altitude"],
    body: ["body"],
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
  const body = chips.find((c) => c.kind === "body");
  assert.equal(body.value, "full");
  assert.equal(chips.find((c) => c.kind === "harvest").year, 2025);
});

test("filterChips: nothing active → no chips; search and sort aren't chips", () => {
  assert.deepEqual(filterChips({}, {}, "/coffees"), []);
  assert.deepEqual(filterChips({ search: "x" }, { q: "x", sort: "saved" }, "/coffees"), []);
});

test("filterChips: light body, a price floor only, and a shop base", () => {
  const chips = filterChips({ maxBody: 2, minPriceTwd: 500 }, { body: "light", min: "500" }, "/shops/demo-roastery");
  assert.deepEqual(
    chips.map((c) => [c.kind, c.href]),
    [
      ["price", "/shops/demo-roastery?body=light"],
      ["body", "/shops/demo-roastery?min=500"],
    ],
  );
  assert.equal(chips[1].value, "light");
});

test("priceChipLabel picks range, floor or ceiling", () => {
  assert.deepEqual(priceChipLabel(300, 900), { key: "chip.priceRange", vars: { min: 300, max: 900 } });
  assert.deepEqual(priceChipLabel(300, undefined), { key: "chip.priceMin", vars: { min: 300 } });
  assert.deepEqual(priceChipLabel(undefined, 900), { key: "chip.priceMax", vars: { max: 900 } });
  assert.deepEqual(priceChipLabel(0, undefined), { key: "chip.priceMin", vars: { min: 0 } });
});
