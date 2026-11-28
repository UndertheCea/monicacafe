// Google Maps links for shop pins (#293, #564). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { googleMapsUrl } from "../lib/directions.ts";

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
