// Google Maps links for shop pins (#293, #564). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { googleMapsUrl, parseMapsLink } from "../lib/directions.ts";

test("googleMapsUrl: Google's documented search URL for a valid pin", () => {
  assert.equal(
    googleMapsUrl({ lat: 25.033964, lng: 121.564468 }),
    "https://www.google.com/maps/search/?api=1&query=25.033964%2C121.564468",
  );
  assert.equal(googleMapsUrl({ lat: -0.5, lng: 0 }), "https://www.google.com/maps/search/?api=1&query=-0.5%2C0");
});

test("googleMapsUrl: null without a usable pin", () => {
  for (const c of [
    { lat: null, lng: null },
    { lat: 25, lng: null },
    { lat: undefined, lng: 121 },
    { lat: NaN, lng: 121 },
    { lat: 25, lng: Infinity },
    { lat: 91, lng: 121 },
    { lat: 25, lng: -181 },
  ]) {
    assert.equal(googleMapsUrl(c), null, JSON.stringify(c));
  }
});

// #565: /map popups carry the same link, built with DOM nodes (seller text never becomes HTML, rule 10).
test("ShopMap popups link to Google Maps from the stored point, in a new tab", () => {
  const src = readFileSync(new URL("../components/map/ShopMap.tsx", import.meta.url), "utf8");
  assert.match(src, /googleMapsUrl\(p\)/);
  assert.match(src, /go\.rel = "noopener noreferrer"/);
  assert.match(src, /go\.target = "_blank"/);
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML/);
  const page = readFileSync(new URL("../app/map/page.tsx", import.meta.url), "utf8");
  assert.match(page, /openInMaps=\{\{ label: t\(locale, "shops\.openInMaps"\), newTab: t\(locale, "common\.newTab"\) \}\}/);
});

// #566: sellers paste a Google Maps link (or a "lat, lng" pair) to set the pin.
test("parseMapsLink reads the point from each Google Maps link shape", () => {
  const p = { lat: 25.033964, lng: 121.564468 };
  const cases = [
    ["25.033964, 121.564468", p],
    ["２５．０３３９６４，１２１．５６４４６８", p],
    ["https://www.google.com/maps/@25.033964,121.564468,17z", p],
    ["https://www.google.com/maps/place/Taipei+101/@25.03,121.56,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d25.033964!4d121.564468!16s", p],
    ["https://www.google.com.tw/maps/place/X/@25.0,121.0,15z/data=!4m2!3m1!1s0!3d25.033964!4d121.564468", p],
    ["https://www.google.com/maps?q=25.033964,121.564468", p],
    ["https://maps.google.com/?q=25.033964,121.564468&z=15", p],
    ["https://www.google.com/maps/search/?api=1&query=25.033964%2C121.564468", p],
    ["https://www.google.com/maps/dir/?api=1&destination=25.033964,121.564468", p],
    ["https://maps.google.com/maps?ll=25.033964,121.564468&z=16", p],
    ["https://www.google.com/maps/@?api=1&map_action=map&center=25.033964,121.564468&zoom=12", p],
    ["  https://www.google.com/maps?q=loc:25.0339641,121.5644722  ", { lat: 25.033964, lng: 121.564472 }],
  ];
  for (const [input, want] of cases) assert.deepEqual(parseMapsLink(input), want, input);
});

test("parseMapsLink: short links can't be read here; anything else without a point is null", () => {
  for (const s of ["https://maps.app.goo.gl/AbCdEf123", "maps.app.goo.gl/x", "https://goo.gl/maps/abc"]) {
    assert.equal(parseMapsLink(s), "short", s);
  }
  for (const s of [
    "",
    "   ",
    "https://www.google.com/maps/place/Taipei+101",
    "https://www.google.com/maps?q=Taipei+101",
    "https://example.com/maps/@25.03,121.56,17z",
    "https://evil.example/?q=25.03,121.56",
    "95, 121",
    "25, 190",
    "25.03",
    "abc, def",
    "%E0%A4%A",
  ]) {
    assert.equal(parseMapsLink(s), null, s);
  }
});

test("map popup and attribution links are ink, not Leaflet's blue", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.leaflet-container \.leaflet-popup-content a,\s*\.leaflet-container \.leaflet-control-attribution a \{\s*color: var\(--color-ink\);/);
});
