// /coffees sort param helpers (lib/coffeeQuery.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SEARCH_MAX_CHARS,
  SORT_PARAMS,
  hasFiltersBesidesSearch,
  clearFiltersHref,
  parseInStockParam,
  parseSearchParam,
  parseSortParam,
  searchHref,
  sortForApi,
} from "../lib/coffeeQuery.ts";

test("parseSortParam accepts known values and falls back to newest", () => {
  const cases = [
    [undefined, ""],
    ["", ""],
    ["price_asc", "price_asc"],
    [" PRICE_DESC ", "price_desc"],
    ["discussed", "discussed"],
    [" Saved", "saved"],
    [["price_asc", "discussed"], "price_asc"],
    ["cheapest", ""],
    ["PRICE_ASC; DROP", ""],
  ];
  for (const [input, want] of cases) assert.equal(parseSortParam(input), want, JSON.stringify(input));
});

test("every sort param maps to a distinct API enum", () => {
  const apis = SORT_PARAMS.map(sortForApi);
  assert.deepEqual(apis, ["NEWEST", "PRICE_ASC", "PRICE_DESC", "MOST_DISCUSSED", "MOST_SAVED"]);
});

test("parseInStockParam only turns on for an explicit yes", () => {
  const cases = [
    [undefined, false],
    ["", false],
    ["1", true],
    ["on", true],
    [" TRUE ", true],
    ["0", false],
    ["false", false],
    [["1", "0"], true],
  ];
  for (const [input, want] of cases) assert.equal(parseInStockParam(input), want, JSON.stringify(input));
});

test("parseSearchParam trims, collapses and caps the search", () => {
  const cases = [
    [undefined, undefined],
    ["", undefined],
    ["   ", undefined],
    ["geisha", "geisha"],
    ["  耶加雪菲 \t  Geisha ", "耶加雪菲 Geisha"],
    [["淺焙", "深焙"], "淺焙"],
    ["100% a_b", "100% a_b"],
    ["a b c d e f g h i j", "a b c d e f g h"],
  ];
  for (const [input, want] of cases) assert.equal(parseSearchParam(input), want, JSON.stringify(input));
  // Capped by code points, not UTF-16 units, and never ends on a space.
  assert.equal(parseSearchParam("咖".repeat(150)), "咖".repeat(SEARCH_MAX_CHARS));
  assert.equal([...parseSearchParam("☕".repeat(120))].length, SEARCH_MAX_CHARS);
  assert.equal(parseSearchParam("a".repeat(99) + " bcd"), "a".repeat(99));
});

test("searchHref builds the header search target", () => {
  assert.equal(searchHref(undefined), "/coffees");
  assert.equal(searchHref("   "), "/coffees");
  assert.equal(searchHref(" geisha "), "/coffees?q=geisha");
  assert.equal(searchHref("耶加雪菲 淺焙"), "/coffees?q=%E8%80%B6%E5%8A%A0%E9%9B%AA%E8%8F%B2+%E6%B7%BA%E7%84%99");
  assert.equal(searchHref("100% & a=b"), "/coffees?q=100%25+%26+a%3Db");
});

test("hasFiltersBesidesSearch ignores the keyword search and unset keys", () => {
  const cases = [
    [{}, false],
    [{ search: "geisha" }, false],
    [{ search: "geisha", roastLevel: undefined }, false],
    [{ roastLevel: "LIGHT" }, true],
    [{ search: "x", inStock: true }, true],
    [{ minAltitudeM: 1500 }, true],
    [{ maxBody: 2 }, true],
  ];
  for (const [input, want] of cases) assert.equal(hasFiltersBesidesSearch(input), want, JSON.stringify(input));
});

test("clearFiltersHref keeps only the search and sort", () => {
  const cases = [
    [[undefined, ""], "/coffees"],
    [["  ", ""], "/coffees"],
    [["耶加雪菲", ""], "/coffees?q=%E8%80%B6%E5%8A%A0%E9%9B%AA%E8%8F%B2"],
    [[undefined, "price_asc"], "/coffees?sort=price_asc"],
    [["kenya", "saved"], "/coffees?q=kenya&sort=saved"],
  ];
  for (const [[q, sort], want] of cases) assert.equal(clearFiltersHref(q, sort), want, JSON.stringify([q, sort]));
});

test("/coffees reads and offers only origin / variety / process / price / in stock (#166)", () => {
  const removed = ["roast", "brew", "flavor", "harvest", "acidity", "sweet", "body", "altitude"];
  const parser = readFileSync(new URL("../lib/coffeeFilters.ts", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("../components/coffees/FilterSidebar.tsx", import.meta.url), "utf8");
  for (const p of removed) {
    assert.ok(!parser.includes(`sp.${p}`), `parseCoffeeSearch reads ?${p}`);
    assert.ok(!sidebar.includes(`name="${p}"`), `the sidebar has a ${p} field`);
  }
  for (const p of ["origin", "variety", "process", "min", "max", "instock"]) {
    assert.ok(parser.includes(`sp.${p}`), `parseCoffeeSearch ignores ?${p}`);
    assert.ok(sidebar.includes(`name="${p}"`), `the sidebar lacks ${p}`);
  }
});
