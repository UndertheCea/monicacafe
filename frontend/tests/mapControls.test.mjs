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

// #539: the touch hint (z-500) stays inside the map's own stacking context, below the sticky header.
test("the map wrapper isolates its layers", () => {
  const src = readFileSync(new URL("../components/map/ShopMap.tsx", import.meta.url), "utf8");
  assert.match(src, /className="relative isolate overflow-hidden/);
});

// #540: the map never uses the visitor's location, so its copy doesn't promise "near you".
test("map copy doesn't promise a nearby view", () => {
  for (const l of LOCALES) {
    for (const [k, v] of Object.entries(DICTS[l])) {
      if (k.startsWith("map.")) assert.doesNotMatch(v, /near you|nearby|附近/i, `${l} ${k}`);
    }
  }
});
