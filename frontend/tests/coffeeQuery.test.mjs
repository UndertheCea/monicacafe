// /coffees sort param helpers (lib/coffeeQuery.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SORT_PARAMS, parseInStockParam, parseSortParam, sortForApi } from "../lib/coffeeQuery.ts";

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
