// Share-card metadata helpers (lib/seo.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { absoluteUrl, shareDescription, shareMetadata } from "../lib/seo.ts";

const base = "https://moni.cafe";

test("absoluteUrl resolves relative paths and rejects non-http schemes", () => {
  const cases = [
    ["/coffees/abc", "https://moni.cafe/coffees/abc"],
    ["https://cdn.example/media/x.jpg", "https://cdn.example/media/x.jpg"],
    ["media/x.png", "https://moni.cafe/media/x.png"],
    ["javascript:alert(1)", null],
    ["data:image/png;base64,AAAA", null],
  ];
  for (const [src, want] of cases) assert.equal(absoluteUrl(src, base), want, src);
});

test("shareDescription collapses whitespace and cuts at 160 characters", () => {
  assert.equal(shareDescription("  花香\n\n 明亮  "), "花香 明亮");
  const long = "咖".repeat(200);
  const got = shareDescription(long);
  assert.equal([...got].length, 160);
  assert.ok(got.endsWith("…"));
  assert.equal(shareDescription("x".repeat(160)), "x".repeat(160));
});

test("shareMetadata: canonical, locales and the first usable image", () => {
  const m = shareMetadata({
    base,
    path: "/coffees/abc",
    title: "Yirgacheffe · Moni Roasters",
    description: "Floral",
    images: [null, "", "javascript:x", "/media/coffees/1.jpg", "/media/coffees/2.jpg"],
    locale: "zh-TW",
  });
  assert.equal(m.alternates.canonical, "https://moni.cafe/coffees/abc");
  assert.equal(m.openGraph.url, "https://moni.cafe/coffees/abc");
  assert.equal(m.openGraph.locale, "zh_TW");
  assert.deepEqual(m.openGraph.alternateLocale, ["en_US"]);
  assert.deepEqual(m.openGraph.images, [{ url: "https://moni.cafe/media/coffees/1.jpg", alt: "Yirgacheffe · Moni Roasters" }]);
  assert.equal(m.twitter.card, "summary_large_image");
});

test("shareMetadata without images uses a small card and no image tags", () => {
  const m = shareMetadata({ base, path: "/shops/moni", title: "Moni", description: "", images: [null], locale: "en" });
  assert.equal(m.openGraph.locale, "en_US");
  assert.equal("images" in m.openGraph, false);
  assert.equal(m.twitter.card, "summary");
});
