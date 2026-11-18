// Price helpers (lib/pricing.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pricePer100g } from "../lib/pricing.ts";

test("pricePer100g rounds half up with integer math", () => {
  const cases = [
    [450, 200, 225], // exact
    [1100, 500, 220],
    [380, 100, 380],
    [500, 227, 220], // 220.26 → 220
    [333, 200, 167], // 166.5 → 167 (half up)
    [1, 300, 0], // 0.33 → 0
    [0, 200, 0],
    [999, 1000, 100], // 99.9 → 100
    [650, 250, 260],
  ];
  for (const [price, weight, want] of cases) assert.equal(pricePer100g(price, weight), want, `${price}/${weight}g`);
});

test("pricePer100g rejects unusable inputs", () => {
  for (const [price, weight] of [
    [450, 0],
    [450, -100],
    [-1, 200],
    [450.5, 200],
    [450, 200.5],
    [Number.NaN, 200],
  ]) {
    assert.equal(pricePer100g(price, weight), null, `${price}/${weight}`);
  }
});

import { coffeeAvailability, variantState } from "../lib/pricing.ts";

test("variantState: an option with no stock reads sold out (#350)", () => {
  const cases = [
    [{ stock: 5, isAvailable: true, priceTwd: 400 }, { kind: "inStock", n: 5 }],
    [{ stock: 0, isAvailable: true, priceTwd: 400 }, { kind: "soldOut" }],
    [{ stock: 4, isAvailable: false, priceTwd: 400 }, { kind: "soldOut" }],
    [{ stock: 0, isAvailable: false, priceTwd: 400 }, { kind: "soldOut" }],
    // An NT$0 option can't be bought, so it isn't "in stock" (#358).
    [{ stock: 4, isAvailable: true, priceTwd: 0 }, { kind: "soldOut" }],
    [{ stock: 4, isAvailable: true, priceTwd: 1 }, { kind: "inStock", n: 4 }],
  ];
  for (const [input, want] of cases) assert.deepEqual(variantState(input), want, JSON.stringify(input));
});
import { coffeeJsonLd } from "../lib/seo.ts";

const v = (priceTwd, weightG, stock, isAvailable = true) => ({ priceTwd, weightG, stock, isAvailable });

test("coffeeAvailability and JSON-LD skip NT$0 options (#358)", () => {
  assert.deepEqual(coffeeAvailability([v(0, 200, 3), v(500, 200, 2)]), { kind: "from", price: 500, per100g: 250 });
  assert.deepEqual(coffeeAvailability([v(0, 200, 3)]), { kind: "soldOut" });
  const ld = coffeeJsonLd(
    { id: "c1", name: "Free", description: "", flavorNotes: [], imageUrls: [], variants: [v(0, 200, 3)], shop: { name: "S", slug: "s" } },
    "https://example.com",
  );
  // No buyable option and no price above NT$0: no InStock offer.
  assert.doesNotMatch(JSON.stringify(ld), /\/InStock/);
});

test("coffeeAvailability: in stock, mixed, sold out, none", () => {
  assert.deepEqual(coffeeAvailability([v(450, 200, 3), v(900, 500, 2)]), { kind: "from", price: 450, per100g: 225 });
  // cheapest options are sold out / unavailable: price comes from the cheapest buyable one
  assert.deepEqual(coffeeAvailability([v(300, 100, 0), v(380, 100, 5, false), v(900, 500, 2)]), {
    kind: "from",
    price: 900,
    per100g: 180,
  });
  assert.deepEqual(coffeeAvailability([v(300, 100, 0), v(900, 500, 2, false)]), { kind: "soldOut" });
  assert.deepEqual(coffeeAvailability([]), { kind: "none" });
});

test("coffeeAvailability agrees with the JSON-LD availability", () => {
  const base = "https://example.com";
  const cases = [[v(450, 200, 3)], [v(300, 100, 0), v(900, 500, 2)], [v(300, 100, 0)], [v(300, 100, 4, false)]];
  for (const variants of cases) {
    const ld = coffeeJsonLd(
      { id: "c1", name: "N", description: "", imageUrls: [], shop: { name: "S" }, variants },
      base,
    );
    const inStock = coffeeAvailability(variants).kind === "from";
    assert.equal(ld.offers.availability, inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock");
  }
});

test("fromPrice: buyable options only, NT$0 reads as sold out (#393)", async () => {
  const { fromPrice } = await import("../lib/pricing.ts");
  const v = (priceTwd, isAvailable = true) => ({ priceTwd, isAvailable });
  const cases = [
    { name: "cheapest available", variants: [v(600), v(450)], want: 450 },
    { name: "unavailable ignored", variants: [v(300, false), v(450)], want: 450 },
    { name: "only NT$0", variants: [v(0)], want: null },
    { name: "NT$0 next to a real price", variants: [v(0), v(450)], want: 450 },
    { name: "none", variants: [], want: null },
  ];
  for (const c of cases) assert.equal(fromPrice({ variants: c.variants }), c.want, c.name);
});
