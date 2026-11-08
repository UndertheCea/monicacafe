// /coffees sort param helpers (lib/coffeeQuery.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SEARCH_MAX_CHARS,
  SORT_PARAMS,
  brewParam,
  parseBrewParam,
  parseHarvestParam,
  parseAcidityParam,
  LOW_ACIDITY_MAX,
  parseInStockParam,
  parseRoastParam,
  parseSearchParam,
  parseSortParam,
  recentHarvestFrom,
  searchHref,
  shopCoffeesHref,
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

test("parseRoastParam accepts the four roasts, any case", () => {
  const cases = [
    [undefined, undefined],
    ["", undefined],
    ["LIGHT", "LIGHT"],
    [" medium_dark ", "MEDIUM_DARK"],
    [["DARK", "LIGHT"], "DARK"],
    ["EXTRA_DARK", undefined],
    ["light;", undefined],
  ];
  for (const [input, want] of cases) assert.equal(parseRoastParam(input), want, JSON.stringify(input));
});

test("shopCoffeesHref keeps search, roast and sort; drops defaults", () => {
  const cases = [
    [{}, "/shops/beans"],
    [{ q: "  ", sort: "" }, "/shops/beans"],
    [{ roast: "LIGHT" }, "/shops/beans?roast=LIGHT"],
    [{ q: "花香 berry", roast: "DARK", sort: "price_asc" }, "/shops/beans?q=%E8%8A%B1%E9%A6%99+berry&roast=DARK&sort=price_asc"],
    [{ sort: "discussed" }, "/shops/beans?sort=discussed"],
    [{ roast: "LIGHT", brew: "ESPRESSO" }, "/shops/beans?roast=LIGHT&brew=espresso"],
    [{ harvest: true, sort: "saved" }, "/shops/beans?harvest=recent&sort=saved"],
    [{ harvest: false }, "/shops/beans"],
    [{ lowAcid: true, harvest: true }, "/shops/beans?harvest=recent&acidity=low"],
    [{ lowAcid: false }, "/shops/beans"],
  ];
  for (const [input, want] of cases) assert.equal(shopCoffeesHref("beans", input), want, JSON.stringify(input));
});

test("parseBrewParam accepts filter / espresso / omni, any case; brewParam is lowercase", () => {
  const cases = [
    [undefined, undefined],
    ["", undefined],
    ["filter", "FILTER"],
    [" Espresso ", "ESPRESSO"],
    ["OMNI", "OMNI"],
    [["omni", "filter"], "OMNI"],
    ["cold_brew", undefined],
    ["filter;", undefined],
  ];
  for (const [input, want] of cases) assert.equal(parseBrewParam(input), want, JSON.stringify(input));
  for (const m of ["FILTER", "ESPRESSO", "OMNI"]) assert.equal(parseBrewParam(brewParam(m)), m);
  assert.equal(brewParam("ESPRESSO"), "espresso");
});

test("parseHarvestParam accepts only recent, any case", () => {
  const cases = [
    [undefined, false],
    ["", false],
    ["recent", true],
    [" Recent ", true],
    [["recent", "x"], true],
    ["1", false],
    ["2025", false],
  ];
  for (const [input, want] of cases) assert.equal(parseHarvestParam(input), want, JSON.stringify(input));
});

test("recentHarvestFrom is last year in Taipei", () => {
  assert.equal(recentHarvestFrom(new Date("2026-06-01T00:00:00Z")), 2025);
  // 2026-12-31 16:00 UTC is already 2027 in Taipei.
  assert.equal(recentHarvestFrom(new Date("2026-12-31T15:59:59Z")), 2025);
  assert.equal(recentHarvestFrom(new Date("2026-12-31T16:00:00Z")), 2026);
});

test("parseAcidityParam accepts only low, any case; low means 1–2", () => {
  const cases = [
    [undefined, false],
    ["", false],
    ["low", true],
    [" LOW ", true],
    [["low", "high"], true],
    ["high", false],
    ["2", false],
  ];
  for (const [input, want] of cases) assert.equal(parseAcidityParam(input), want, JSON.stringify(input));
  assert.equal(LOW_ACIDITY_MAX, 2);
});
