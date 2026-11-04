import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLocale, pick, t } from "./dict.ts";

describe("t", () => {
  const cases: { name: string; got: string; want: string }[] = [
    { name: "zh-TW plain", got: t("zh-TW", "nav.map"), want: "地圖" },
    { name: "en plain", got: t("en", "nav.map"), want: "Map" },
    { name: "interpolates", got: t("en", "map.count", { n: 3 }), want: "3 shops on the map" },
    { name: "interpolates zh", got: t("zh-TW", "coffees.from", { price: "1,200" }), want: "NT$1,200 起" },
    { name: "leaves unknown placeholders", got: t("en", "map.count", { x: 1 }), want: "{n} shops on the map" },
  ];
  for (const tc of cases) {
    it(tc.name, () => assert.equal(tc.got, tc.want));
  }
});

describe("isLocale / pick", () => {
  it("accepts only supported locales", () => {
    assert.equal(isLocale("zh-TW"), true);
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("ja"), false);
    assert.equal(isLocale(undefined), false);
  });
  it("picks the field for the locale", () => {
    assert.equal(pick("zh-TW", "日曬", "Natural"), "日曬");
    assert.equal(pick("en", "日曬", "Natural"), "Natural");
  });
});
