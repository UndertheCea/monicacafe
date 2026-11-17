// Leaflet's built-in controls are translated and the attribution flag is gone (#363). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DICTS, LOCALES } from "../lib/i18n/dict.ts";
import { MAP_CONTROL_KEYS, mapControlLabels } from "../lib/mapControls.ts";

test("map control labels exist in both locales and differ between them", () => {
  for (const key of Object.values(MAP_CONTROL_KEYS)) {
    for (const l of LOCALES) assert.ok(DICTS[l][key]?.trim(), `${l} ${key}`);
    assert.notEqual(DICTS["zh-TW"][key], DICTS.en[key], key);
  }
  const zh = mapControlLabels("zh-TW");
  const en = mapControlLabels("en");
  assert.equal(en.zoomIn, "Zoom in");
  assert.notEqual(zh.closePopup, en.closePopup);
});

test("ShopMap hides the default zoom control and the attribution flag", () => {
  const src = readFileSync(new URL("../components/map/ShopMap.tsx", import.meta.url), "utf8");
  assert.match(src, /zoomControl:\s*false/);
  assert.match(src, /L\.control\.zoom\(/);
  assert.match(src, /attributionControl\.setPrefix\(\s*'<a href="https:\/\/leafletjs\.com">Leaflet<\/a>'\s*\)/);
  assert.match(src, /leaflet-popup-close-button/);
});
