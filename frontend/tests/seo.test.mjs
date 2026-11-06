// Share-card metadata helpers (lib/seo.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { absoluteUrl, coffeeJsonLd, serializeJsonLd, shareDescription, shareMetadata } from "../lib/seo.ts";

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

const coffee = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "耶加雪菲 Kochere",
  description: "  柑橘\n 花香  ",
  imageUrls: ["/media/coffees/a.jpg", "javascript:alert(1)"],
  shop: { name: "山小烘焙" },
  variants: [
    { priceTwd: 450, stock: 0, isAvailable: true },
    { priceTwd: 800, stock: 3, isAvailable: true },
    { priceTwd: 100, stock: 9, isAvailable: false },
  ],
};

test("coffeeJsonLd describes the product and an aggregate TWD offer over available options", () => {
  const ld = coffeeJsonLd(coffee, base);
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.url, `${base}/coffees/${coffee.id}`);
  assert.equal(ld.name, coffee.name);
  assert.equal(ld.description, "柑橘 花香");
  assert.deepEqual(ld.image, [`${base}/media/coffees/a.jpg`]);
  assert.deepEqual(ld.brand, { "@type": "Brand", name: "山小烘焙" });
  assert.deepEqual(ld.offers, {
    "@type": "AggregateOffer",
    priceCurrency: "TWD",
    lowPrice: 450, // the unavailable NT$100 option isn't offered
    highPrice: 800,
    offerCount: 2,
    availability: "https://schema.org/InStock",
    url: `${base}/coffees/${coffee.id}`,
  });
});

test("coffeeJsonLd: sold out, no options, no photos", () => {
  const soldOut = coffeeJsonLd({ ...coffee, variants: [{ priceTwd: 500, stock: 0, isAvailable: true }] }, base);
  assert.equal(soldOut.offers.availability, "https://schema.org/OutOfStock");
  const allOff = coffeeJsonLd({ ...coffee, variants: [{ priceTwd: 500, stock: 4, isAvailable: false }] }, base);
  assert.equal(allOff.offers.availability, "https://schema.org/OutOfStock");
  assert.equal(allOff.offers.lowPrice, 500);
  const bare = coffeeJsonLd({ ...coffee, description: " ", imageUrls: [], variants: [] }, base);
  assert.equal(bare.offers, undefined);
  assert.equal(bare.image, undefined);
  assert.equal(bare.description, undefined);
});

test("serializeJsonLd can't be broken out of by seller text", () => {
  const evil = { name: "</script><script>alert(1)</script><!-- & \u2028" };
  const out = serializeJsonLd(evil);
  assert.ok(!/[<>&\u2028\u2029]/.test(out), out);
  assert.deepEqual(JSON.parse(out), evil);
});
