// Sitemap helpers (lib/sitemap.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SITE_URL, pageOffsets, siteBase, sitemapEntries } from "../lib/sitemap.ts";

test("siteBase normalises SITE_URL", () => {
  const cases = [
    [undefined, DEFAULT_SITE_URL],
    ["", DEFAULT_SITE_URL],
    ["https://monicafe.tw", "https://monicafe.tw"],
    [" https://monicafe.tw/ ", "https://monicafe.tw"],
    ["https://example.com/tw//", "https://example.com/tw"],
    ["ftp://example.com", DEFAULT_SITE_URL],
    ["not a url", DEFAULT_SITE_URL],
  ];
  for (const [raw, want] of cases) assert.equal(siteBase(raw), want, String(raw));
});

test("pageOffsets walks the list and respects the cap", () => {
  assert.deepEqual(pageOffsets(0, 100, 1000), []);
  assert.deepEqual(pageOffsets(1, 100, 1000), [0]);
  assert.deepEqual(pageOffsets(250, 100, 1000), [0, 100, 200]);
  assert.deepEqual(pageOffsets(5000, 100, 300), [0, 100, 200]);
  assert.deepEqual(pageOffsets(-3, 100, 1000), []);
});

test("sitemapEntries lists static pages, shops and coffees once each", () => {
  const got = sitemapEntries("https://monicafe.tw", ["mountain-roast", "mountain-roast"], ["0b9c…", "a b"]);
  const urls = got.map((e) => e.url);
  assert.deepEqual(urls, [
    "https://monicafe.tw/",
    "https://monicafe.tw/coffees",
    "https://monicafe.tw/shops",
    "https://monicafe.tw/map",
    "https://monicafe.tw/shops/mountain-roast",
    "https://monicafe.tw/coffees/0b9c%E2%80%A6",
    "https://monicafe.tw/coffees/a%20b",
  ]);
  assert.ok(got.every((e) => e.priority > 0 && e.priority <= 1));
  assert.ok(!urls.some((u) => u.includes("/dashboard")), "no private pages");
});
