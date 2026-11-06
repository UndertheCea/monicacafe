// Bilingual dictionary checks. Run with `npm test` (Node's built-in runner;
// Node 22.18+ strips TypeScript types, so dict.ts is imported directly).
// TypeScript already enforces that both locales have the same keys; these
// tests catch what the types can't: empty strings and mismatched {placeholders}.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DICTS, LOCALES, localeFromLang, pick, t } from "../lib/i18n/dict.ts";

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every locale has the same keys", () => {
  const zhKeys = Object.keys(DICTS["zh-TW"]).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(DICTS[locale]).sort(), zhKeys, locale);
  }
});

test("no empty messages and placeholders match across locales", () => {
  for (const [key, zh] of Object.entries(DICTS["zh-TW"])) {
    for (const locale of LOCALES) {
      const msg = DICTS[locale][key];
      assert.ok(msg.trim().length > 0, `${locale} ${key} is empty`);
      assert.deepEqual(placeholders(msg), placeholders(zh), `${locale} ${key} placeholders`);
    }
  }
});

test("t() interpolates and leaves unknown placeholders alone", async (tt) => {
  const cases = [
    { locale: "zh-TW", key: "nav.map", vars: undefined, want: "地圖" },
    { locale: "en", key: "nav.map", vars: undefined, want: "Map" },
    { locale: "en", key: "map.count", vars: { n: 3 }, want: "3 shops on the map" },
    { locale: "zh-TW", key: "map.count", vars: { n: 3 }, want: "地圖上共 3 間店家" },
    { locale: "en", key: "map.count", vars: {}, want: "{n} shops on the map" },
  ];
  for (const c of cases) {
    await tt.test(`${c.locale} ${c.key}`, () => assert.equal(t(c.locale, c.key, c.vars), c.want));
  }
});

test("pick()", () => {
  assert.equal(pick("zh-TW", "水洗", "Washed"), "水洗");
  assert.equal(pick("en", "水洗", "Washed"), "Washed");
});

test("localeFromLang reads <html lang> and falls back to zh-TW", () => {
  const cases = [
    ["en", "en"],
    ["zh-TW", "zh-TW"],
    ["", "zh-TW"],
    [null, "zh-TW"],
    [undefined, "zh-TW"],
    ["fr", "zh-TW"],
  ];
  for (const [lang, want] of cases) assert.equal(localeFromLang(lang), want, String(lang));
});
