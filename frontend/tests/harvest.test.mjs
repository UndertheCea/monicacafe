// Harvest year (lib/harvest.ts), its label and the JSON-LD property. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { knownHarvestYear } from "../lib/harvest.ts";
import { t } from "../lib/i18n/dict.ts";
import { coffeeJsonLd } from "../lib/seo.ts";

test("knownHarvestYear keeps only whole years the API could store", () => {
  for (const y of [2000, 2025, 2100]) assert.equal(knownHarvestYear(y), y);
  for (const y of [null, undefined, 1999, 2101, 2025.5, NaN, 0]) assert.equal(knownHarvestYear(y), null, String(y));
});

test("harvest value reads like the bag label", () => {
  assert.equal(t("zh-TW", "coffee.harvestValue", { year: 2025 }), "2025 產季");
  assert.equal(t("en", "coffee.harvestValue", { year: 2025 }), "2025 harvest");
});

test("coffeeJsonLd adds the harvest year as a property", () => {
  const coffee = { id: "c1", name: "Guji", description: "", imageUrls: [], shop: { name: "Dawn" }, variants: [] };
  assert.equal(coffeeJsonLd({ ...coffee, harvestYear: null }, "https://moni.cafe").additionalProperty, undefined);
  assert.equal(coffeeJsonLd({ ...coffee, harvestYear: 1999 }, "https://moni.cafe").additionalProperty, undefined);
  const ld = coffeeJsonLd({ ...coffee, brewMethod: "FILTER", harvestYear: 2025 }, "https://moni.cafe");
  assert.deepEqual(ld.additionalProperty, [
    { "@type": "PropertyValue", name: "Roasted for", value: "Filter" },
    { "@type": "PropertyValue", name: "Harvest year", value: "2025" },
  ]);
});
