// /shops sort param helpers (lib/shopQuery.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SHOP_SORT_PARAMS, parseShopSortParam, shopListHref, shopSortForApi } from "../lib/shopQuery.ts";

test("parseShopSortParam accepts known values and falls back to newest", () => {
  const cases = [
    [undefined, ""],
    ["", ""],
    ["name", "name"],
    [" COFFEES ", "coffees"],
    [["coffees", "name"], "coffees"],
    ["price_asc", ""], // a coffee sort isn't a shop sort
    ["name; DROP", ""],
  ];
  for (const [input, want] of cases) assert.equal(parseShopSortParam(input), want, JSON.stringify(input));
});

test("every shop sort param maps to a distinct API enum", () => {
  const apis = SHOP_SORT_PARAMS.map(shopSortForApi);
  assert.deepEqual(apis, ["NEWEST", "NAME", "MOST_COFFEES"]);
  assert.equal(new Set(apis).size, SHOP_SORT_PARAMS.length);
});

test("shopListHref keeps search and sort, drops defaults", () => {
  const cases = [
    [{}, "/shops"],
    [{ q: "  ", sort: "" }, "/shops"],
    [{ sort: "name" }, "/shops?sort=name"],
    [{ q: "淺焙 roast" }, "/shops?q=%E6%B7%BA%E7%84%99+roast"],
    [{ q: " a&b ", sort: "coffees" }, "/shops?q=a%26b&sort=coffees"],
  ];
  for (const [input, want] of cases) assert.equal(shopListHref(input), want, JSON.stringify(input));
});
