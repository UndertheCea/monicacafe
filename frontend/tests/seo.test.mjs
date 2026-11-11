// Share-card metadata helpers (lib/seo.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  absoluteUrl,
  coffeeJsonLd,
  listingCanonicalPath,
  listingRobots,
  serializeJsonLd,
  shareDescription,
  shareMetadata,
  shopJsonLd,
} from "../lib/seo.ts";

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
    { priceTwd: 450, weightG: 200, stock: 0, isAvailable: true },
    { priceTwd: 800, weightG: 200, stock: 3, isAvailable: true },
    { priceTwd: 100, weightG: 200, stock: 9, isAvailable: false },
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
  const soldOut = coffeeJsonLd({ ...coffee, variants: [{ priceTwd: 500, weightG: 200, stock: 0, isAvailable: true }] }, base);
  assert.equal(soldOut.offers.availability, "https://schema.org/OutOfStock");
  const allOff = coffeeJsonLd({ ...coffee, variants: [{ priceTwd: 500, weightG: 200, stock: 4, isAvailable: false }] }, base);
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

const shop = {
  slug: "moon-roast",
  name: "月光烘焙",
  description: "  台中的小烘豆室\n\n手工烘焙  ",
  logoUrl: "/media/shops/1/logo.png",
  bannerUrl: "https://moni.cafe/media/shops/1/banner.jpg",
  city: "台中市",
  lat: 24.1477,
  lng: 120.6736,
};

test("shopJsonLd describes a Store in Taiwan with geo and the listed coffees", () => {
  const ld = shopJsonLd(shop, [{ id: "c1", name: "耶加雪菲" }, { id: "c2", name: "Kenya AA" }], base);
  assert.equal(ld["@type"], "Store");
  assert.equal(ld.url, "https://moni.cafe/shops/moon-roast");
  assert.equal(ld.description, "台中的小烘豆室 手工烘焙");
  assert.equal(ld.logo, "https://moni.cafe/media/shops/1/logo.png");
  assert.deepEqual(ld.image, ["https://moni.cafe/media/shops/1/banner.jpg", "https://moni.cafe/media/shops/1/logo.png"]);
  assert.deepEqual(ld.address, { "@type": "PostalAddress", addressCountry: "TW", addressLocality: "台中市" });
  assert.deepEqual(ld.geo, { "@type": "GeoCoordinates", latitude: 24.1477, longitude: 120.6736 });
  const items = ld.hasOfferCatalog.itemListElement;
  assert.equal(items.length, 2);
  assert.equal(items[1].position, 2);
  assert.equal(items[1].url, "https://moni.cafe/coffees/c2");
  assert.equal(items[0].itemOffered.name, "耶加雪菲");
});

test("shopJsonLd leaves out what the shop doesn't have", () => {
  const cases = [
    { name: "no coords", patch: { lat: null, lng: null }, absent: ["geo"] },
    { name: "one coord", patch: { lat: 24.1, lng: undefined }, absent: ["geo"] },
    { name: "out of range", patch: { lat: 124.1, lng: 120 }, absent: ["geo"] },
    { name: "no images", patch: { logoUrl: null, bannerUrl: null }, absent: ["logo", "image"] },
    { name: "bad image scheme", patch: { logoUrl: "javascript:alert(1)", bannerUrl: null }, absent: ["logo", "image"] },
    { name: "no description", patch: { description: "   " }, absent: ["description"] },
  ];
  for (const c of cases) {
    const ld = shopJsonLd({ ...shop, ...c.patch }, [], base);
    for (const key of c.absent) assert.equal(ld[key], undefined, `${c.name}: ${key}`);
    assert.equal(ld.hasOfferCatalog, undefined, `${c.name}: catalogue without coffees`);
  }
  const noCity = shopJsonLd({ ...shop, city: "" }, [], base);
  assert.deepEqual(noCity.address, { "@type": "PostalAddress", addressCountry: "TW" });
});

test("shopJsonLd output stays inside its script element", () => {
  const out = serializeJsonLd(shopJsonLd({ ...shop, name: "</script><script>alert(1)</script>" }, [], base));
  assert.ok(!out.includes("<"), out);
});

test("listingCanonicalPath keeps only the page number (#195)", () => {
  const cases = [
    ["/coffees", 1, "/coffees"],
    ["/coffees", 2, "/coffees?page=2"],
    ["/shops", 13, "/shops?page=13"],
    ["/shops", 0, "/shops"],
    ["/shops", -3, "/shops"],
    ["/coffees", Number.NaN, "/coffees"],
    ["/coffees", 2.5, "/coffees"],
    ["/coffees", Infinity, "/coffees"],
  ];
  for (const [base, page, want] of cases) assert.equal(listingCanonicalPath(base, page), want, `${base} ${page}`);
});

test("listingRobots: keyword-search results are noindex, follow; plain listings are left alone (#195)", () => {
  for (const q of [undefined, null, "", "   "]) assert.equal(listingRobots(q), undefined, JSON.stringify(q));
  assert.deepEqual(listingRobots("geisha"), { index: false, follow: true });
});

test("home and listing pages build their share card with shareMetadata (#195)", () => {
  const root = new URL("..", import.meta.url).pathname;
  for (const f of ["app/page.tsx", "app/coffees/page.tsx", "app/shops/page.tsx", "app/map/page.tsx"]) {
    const src = readFileSync(root + f, "utf8");
    assert.match(src, /export async function generateMetadata/, f);
    assert.match(src, /shareMetadata\(/, f);
  }
  for (const f of ["app/coffees/page.tsx", "app/shops/page.tsx"]) {
    const src = readFileSync(root + f, "utf8");
    assert.match(src, /listingCanonicalPath\(/, f);
    assert.match(src, /robots: listingRobots\(/, f);
  }
});
