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
    ["followers", "followers"],
    [["coffees", "name"], "coffees"],
    ["price_asc", ""], // a coffee sort isn't a shop sort
    ["name; DROP", ""],
  ];
  for (const [input, want] of cases) assert.equal(parseShopSortParam(input), want, JSON.stringify(input));
});

test("every shop sort param maps to a distinct API enum", () => {
  const apis = SHOP_SORT_PARAMS.map(shopSortForApi);
  assert.deepEqual(apis, ["NEWEST", "NAME", "MOST_COFFEES", "MOST_FOLLOWED"]);
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

test("parseShopPagePages reads ?page and ?archive, defaulting to 1", async () => {
  const { parseShopPagePages } = await import("../lib/shopQuery.ts");
  const cases = [
    [{}, { page: 1, archive: 1 }],
    [{ page: "3" }, { page: 3, archive: 1 }],
    [{ archive: "2", page: "0" }, { page: 1, archive: 2 }],
    [{ page: "-4", archive: "x" }, { page: 1, archive: 1 }],
    [{ page: ["2", "5"], archive: "2.9" }, { page: 2, archive: 2 }],
    [{ roast: "DARK", q: "x" }, { page: 1, archive: 1 }],
  ];
  for (const [sp, want] of cases) assert.deepEqual(parseShopPagePages(sp), want, JSON.stringify(sp));
});

test("shopPageHref keeps the other list's page and drops page 1", async () => {
  const { shopPageHref } = await import("../lib/shopQuery.ts");
  const cases = [
    [{ page: 1, archive: 1 }, undefined, "/shops/beans"],
    [{ page: 2, archive: 1 }, undefined, "/shops/beans?page=2"],
    [{ page: 2, archive: 3 }, "archive", "/shops/beans?page=2&archive=3#archive"],
    [{ page: 1, archive: 2 }, "archive", "/shops/beans?archive=2#archive"],
    [{ page: 1, archive: 1 }, "archive", "/shops/beans#archive"],
  ];
  for (const [p, anchor, want] of cases) assert.equal(shopPageHref("beans", p, anchor), want, JSON.stringify(p));
});
