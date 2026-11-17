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

test("every Leaflet map translates its zoom control and hides the attribution flag", () => {
  for (const file of ["../components/map/ShopMap.tsx", "../components/dashboard/LocationPicker.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /zoomControl:\s*false/, file);
    assert.match(src, /L\.control\.zoom\(/, file);
    assert.match(src, /zoomInTitle/, file);
    assert.match(src, /attributionControl\.setPrefix\(\s*'<a href="https:\/\/leafletjs\.com">Leaflet<\/a>'\s*\)/, file);
  }
  const map = readFileSync(new URL("../components/map/ShopMap.tsx", import.meta.url), "utf8");
  assert.match(map, /leaflet-popup-close-button/);
});
