// Brew method labels (lib/brew.ts) and the JSON-LD property. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brewLongKey, knownBrewMethod } from "../lib/brew.ts";
import { t } from "../lib/i18n/dict.ts";
import { coffeeJsonLd } from "../lib/seo.ts";

test("knownBrewMethod keeps only the API's values", () => {
  for (const m of ["FILTER", "ESPRESSO", "OMNI"]) assert.equal(knownBrewMethod(m), m);
  for (const m of [null, undefined, "", "filter", "COLD_BREW"]) assert.equal(knownBrewMethod(m), null, String(m));
});

test("brew label keys: omni spelled out on the page", () => {
  const cases = [
    ["FILTER", "brew.FILTER"],
    ["ESPRESSO", "brew.ESPRESSO"],
    ["OMNI", "brew.OMNI_LONG"],
    [null, null],
    ["SIPHON", null],
  ];
  for (const [m, long] of cases) assert.equal(brewLongKey(m), long, String(m));
  assert.equal(t("zh-TW", brewLongKey("FILTER")), "手沖");
  assert.equal(t("en", brewLongKey("OMNI")), "Omni (filter and espresso)");
});

test("coffeeJsonLd adds the brew method as a Roasted for property", () => {
  const coffee = { id: "c1", name: "Nyeri", description: "", imageUrls: [], shop: { name: "Dawn" }, variants: [] };
  assert.equal(coffeeJsonLd({ ...coffee, brewMethod: null }, "https://moni.cafe").additionalProperty, undefined);
  assert.equal(coffeeJsonLd({ ...coffee, brewMethod: "SIPHON" }, "https://moni.cafe").additionalProperty, undefined);
  const ld = coffeeJsonLd(
    { ...coffee, brewMethod: "OMNI", provenance: [["coffee.region", "Nyeri"]] },
    "https://moni.cafe",
  );
  assert.deepEqual(ld.additionalProperty, [
    { "@type": "PropertyValue", name: "Region", value: "Nyeri" },
    { "@type": "PropertyValue", name: "Roasted for", value: "Filter and espresso" },
  ]);
});
