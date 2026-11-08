// Cup profile (lib/cupProfile.ts), its labels and the JSON-LD properties. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cupScalesOf, knownCupValue } from "../lib/cupProfile.ts";
import { t } from "../lib/i18n/dict.ts";
import { coffeeJsonLd } from "../lib/seo.ts";

test("knownCupValue keeps only whole numbers 1–5", () => {
  for (const v of [1, 3, 5]) assert.equal(knownCupValue(v), v);
  for (const v of [null, undefined, 0, 6, 2.5, NaN, -1]) assert.equal(knownCupValue(v), null, String(v));
});

test("cupScalesOf lists set scales in acidity, sweetness, body order", () => {
  assert.deepEqual(cupScalesOf({ acidity: null, sweetness: null, body: null }), []);
  assert.deepEqual(cupScalesOf({}), []);
  assert.deepEqual(cupScalesOf({ body: 4, acidity: 2, sweetness: 9 }), [
    { scale: "acidity", value: 2 },
    { scale: "body", value: 4 },
  ]);
});

test("cup value labels read as a score", () => {
  assert.equal(t("zh-TW", "cup.value", { scale: t("zh-TW", "cup.acidity"), n: 2, max: 5 }), "酸度 2 / 5");
  assert.equal(t("en", "cup.value", { scale: t("en", "cup.body"), n: 4, max: 5 }), "Body 4 of 5");
});

test("coffeeJsonLd adds the cup profile as bounded properties", () => {
  const coffee = { id: "c1", name: "Nyeri", description: "", imageUrls: [], shop: { name: "Dawn" }, variants: [] };
  assert.equal(coffeeJsonLd({ ...coffee, cup: [] }, "https://moni.cafe").additionalProperty, undefined);
  const ld = coffeeJsonLd({ ...coffee, cup: cupScalesOf({ acidity: 5, sweetness: 3 }) }, "https://moni.cafe");
  assert.deepEqual(ld.additionalProperty, [
    { "@type": "PropertyValue", name: "Acidity", value: 5, minValue: 1, maxValue: 5 },
    { "@type": "PropertyValue", name: "Sweetness", value: 3, minValue: 1, maxValue: 5 },
  ]);
});
