// Sitemap helpers (lib/sitemap.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SITE_URL, laterDate, pageOffsets, siteBase, sitemapEntries } from "../lib/sitemap.ts";

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
  const at = "2026-11-01T00:00:00Z";
  const got = sitemapEntries(
    "https://monicafe.tw",
    [{ slug: "mountain-roast", updatedAt: at }, { slug: "mountain-roast", updatedAt: at }],
    [{ id: "0b9c…", updatedAt: at, shop: { slug: "x" } }, { id: "a b", updatedAt: at, shop: { slug: "x" } }],
  );
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

test("laterDate picks the later valid timestamp", () => {
  assert.equal(laterDate("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"), "2026-02-01T00:00:00.000Z");
  assert.equal(laterDate("2026-03-01T00:00:00+08:00", "2026-02-01T00:00:00Z"), "2026-02-28T16:00:00.000Z");
  assert.equal(laterDate("nope", "2026-02-01T00:00:00Z"), "2026-02-01T00:00:00.000Z");
  assert.equal(laterDate("2026-02-01T00:00:00Z", undefined), "2026-02-01T00:00:00.000Z");
  assert.equal(laterDate(undefined, "garbage"), undefined);
});

test("sitemapEntries sets lastmod: coffees their own, shops the latest of shop and its coffees", () => {
  const got = sitemapEntries(
    "https://monicafe.tw",
    [
      { slug: "a", updatedAt: "2026-01-01T00:00:00Z" },
      { slug: "b", updatedAt: "2026-05-01T00:00:00Z" },
      { slug: "c", updatedAt: "not a date" },
    ],
    [
      { id: "1", updatedAt: "2026-03-01T00:00:00Z", shop: { slug: "a" } },
      { id: "2", updatedAt: "2026-02-01T00:00:00Z", shop: { slug: "b" } },
      { id: "3", updatedAt: "bad", shop: { slug: "unknown-shop" } },
    ],
  );
  const lm = Object.fromEntries(got.map((e) => [e.url.replace("https://monicafe.tw", ""), e.lastModified]));
  assert.equal(lm["/"], undefined, "static pages have no lastmod");
  assert.equal(lm["/shops/a"], "2026-03-01T00:00:00.000Z", "a newer coffee moves its shop");
  assert.equal(lm["/shops/b"], "2026-05-01T00:00:00.000Z", "an older coffee doesn't");
  assert.equal(lm["/shops/c"], undefined, "bad dates are dropped");
  assert.equal(lm["/coffees/1"], "2026-03-01T00:00:00.000Z");
  assert.equal(lm["/coffees/3"], undefined);
  assert.ok(!("lastModified" in got[0]), "no undefined key on static entries");
});
