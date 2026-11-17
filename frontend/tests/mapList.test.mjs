// The /map text list and the coffee card lines (#294). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardLines } from "../lib/coffeeCard.ts";
import { cityGroups, cityShopsHref } from "../lib/mapList.ts";
import { shopListHref } from "../lib/shopQuery.ts";

test("cityShopsHref: encoded city link, null for the no-city group", () => {
  assert.equal(cityShopsHref("台中市"), "/shops?city=%E5%8F%B0%E4%B8%AD%E5%B8%82");
  assert.equal(cityShopsHref("A & B"), "/shops?city=A+%26+B");
  assert.equal(cityShopsHref("—"), null);
  assert.equal(cityShopsHref("  "), null);
});

test("shopListHref: keeps the city with search and sort", () => {
  assert.equal(shopListHref({ city: "台中市", sort: "name" }), "/shops?city=%E5%8F%B0%E4%B8%AD%E5%B8%82&sort=name");
  assert.equal(shopListHref({ q: "a", city: " " }), "/shops?q=a");
  assert.equal(shopListHref({}), "/shops");
});

const shop = (id, city) => ({ id, city });

test("cityGroups: biggest city first, shops capped with a 'more' count", () => {
  const pins = [shop("1", "A"), shop("2", "B"), shop("3", "B"), shop("4", "B"), shop("5", "A"), shop("6", "")];
  const g = cityGroups(pins, 2);
  assert.deepEqual(
    g.map((x) => [x.city, x.count, x.shops.length, x.more]),
    [
      ["B", 3, 2, 1],
      ["A", 2, 2, 0],
      ["—", 1, 1, 0],
    ],
  );
  assert.deepEqual(g[0].shops.map((s) => s.id), ["2", "3"], "keeps the given order");
  assert.deepEqual(cityGroups([]), []);
});

test("cardLines: a photo card prints the words, a tile card only the producer", () => {
  const base = { producer: "Finca A", region: "Huila", country: "Colombia", process: "Washed", variety: "Caturra" };
  const cases = [
    { name: "photo", w: { ...base, hasPhoto: true }, want: { source: "Finca A · Huila", facts: "Colombia · Washed · Caturra" } },
    { name: "photo, no producer or variety", w: { ...base, hasPhoto: true, producer: " ", variety: null }, want: { source: "Huila", facts: "Colombia · Washed" } },
    { name: "tile", w: { ...base, hasPhoto: false }, want: { source: "Finca A", facts: "" } },
    { name: "tile, no producer", w: { ...base, hasPhoto: false, producer: null }, want: { source: "", facts: "" } },
  ];
  for (const c of cases) assert.deepEqual(cardLines(c.w), c.want, c.name);
});
