// /coffees sort param helpers (lib/coffeeQuery.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SEARCH_MAX_CHARS,
  SORT_PARAMS,
  parseInStockParam,
  parseSearchParam,
  parseSortParam,
  sortForApi,
} from "../lib/coffeeQuery.ts";

test("parseSortParam accepts known values and falls back to newest", () => {
  const cases = [
    [undefined, ""],
    ["", ""],
    ["price_asc", "price_asc"],
    [" PRICE_DESC ", "price_desc"],
    ["discussed", "discussed"],
    [["price_asc", "discussed"], "price_asc"],
    ["cheapest", ""],
    ["PRICE_ASC; DROP", ""],
  ];
  for (const [input, want] of cases) assert.equal(parseSortParam(input), want, JSON.stringify(input));
});

test("every sort param maps to a distinct API enum", () => {
  const apis = SORT_PARAMS.map(sortForApi);
  assert.deepEqual(apis, ["NEWEST", "PRICE_ASC", "PRICE_DESC", "MOST_DISCUSSED"]);
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
