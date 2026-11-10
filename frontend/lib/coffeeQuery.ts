// URL ⇄ API mapping for /coffees options that aren't plain filters. No
// imports, so `npm test` can load it directly.

export type CoffeeSort = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "MOST_DISCUSSED" | "MOST_SAVED" | "SHOP_ORDER";

/** Light to dark. EXTRA_LIGHT (極淺焙) was added on the owner's answer to #176. */
export type RoastLevel = "EXTRA_LIGHT" | "LIGHT" | "MEDIUM" | "MEDIUM_DARK" | "DARK";
export const ROAST_LEVELS: RoastLevel[] = ["EXTRA_LIGHT", "LIGHT", "MEDIUM", "MEDIUM_DARK", "DARK"];

/** What a coffee is roasted for (API enum BrewMethod). OMNI suits both. */
export type BrewMethod = "FILTER" | "ESPRESSO" | "OMNI";
export const BREW_METHODS: BrewMethod[] = ["FILTER", "ESPRESSO", "OMNI"];

/** `?sort=` values in the order the dropdown lists them ("" = newest, the default). */
export const SORT_PARAMS = ["", "price_asc", "price_desc", "discussed", "saved"] as const;
export type SortParam = (typeof SORT_PARAMS)[number];

const TO_API: Record<SortParam, CoffeeSort> = {
  "": "NEWEST",
  price_asc: "PRICE_ASC",
  price_desc: "PRICE_DESC",
  discussed: "MOST_DISCUSSED",
  saved: "MOST_SAVED",
};

/** Parse `?sort=`; anything unknown falls back to newest (""). */
export function parseSortParam(v: string | string[] | undefined): SortParam {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() ?? "";
  return (SORT_PARAMS as readonly string[]).includes(s) ? (s as SortParam) : "";
}

/** The GraphQL `sort` argument for a `?sort=` value. */
export function sortForApi(p: SortParam): CoffeeSort {
  return TO_API[p];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `?origin=` / `?variety=` / `?process=`: an id is kept only when it looks
 * like a UUID (the API rejects anything else with BAD_USER_INPUT, which would
 * turn a truncated link into the error page, #179). Junk → undefined (no filter).
 */
export function parseIdParam(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  return UUID_RE.test(s) ? s.toLowerCase() : undefined;
}

/**
 * The price filter from `?min=` / `?max=` (already parsed to whole NT$). A
 * range typed backwards (900 – 100) is read the right way round, because the
 * API rejects min > max and the page would show its error state (#180).
 */
export function priceRange(min: number | undefined, max: number | undefined): { minPriceTwd?: number; maxPriceTwd?: number } {
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  return {
    ...(min !== undefined ? { minPriceTwd: min } : {}),
    ...(max !== undefined ? { maxPriceTwd: max } : {}),
  };
}

/** `?instock=1` (the sidebar checkbox) → true; anything else → no restriction. */
export function parseInStockParam(v: string | string[] | undefined): boolean {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "on";
}

/** Longest search the API accepts (characters) and most words it matches. */
export const SEARCH_MAX_CHARS = 100;
export const SEARCH_MAX_WORDS = 8;

/**
 * `?q=` → the API's `filter.search`: whitespace collapsed, at most
 * SEARCH_MAX_WORDS words and SEARCH_MAX_CHARS characters (code points, like
 * the API counts), so a long paste narrows the search instead of erroring.
 * Blank → undefined.
 */
export function parseSearchParam(v: string | string[] | undefined): string | undefined {
  const words = ((Array.isArray(v) ? v[0] : v) ?? "").split(/\s+/).filter(Boolean).slice(0, SEARCH_MAX_WORDS);
  const s = [...words.join(" ")].slice(0, SEARCH_MAX_CHARS).join("").trim();
  return s || undefined;
}

/** Where the header search goes: /coffees?q=… (just /coffees for a blank search). */
export function searchHref(q: string | undefined): string {
  const s = parseSearchParam(q);
  return s ? `/coffees?${new URLSearchParams({ q: s })}` : "/coffees";
}

/**
 * True when a parsed /coffees filter narrows the list by more than the
 * keyword search (origin, variety, process, price, in stock).
 */
export function hasFiltersBesidesSearch(filter: object): boolean {
  return Object.entries(filter).some(([k, v]) => k !== "search" && v !== undefined);
}

/**
 * "Clear filters" on /coffees: page 1 with only the keyword search and the
 * sort kept, so the buyer sees everything that matches their words.
 */
export function clearFiltersHref(q: string | undefined, sort: SortParam): string {
  const params = new URLSearchParams();
  const s = q?.trim();
  if (s) params.set("q", s);
  if (sort) params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/coffees?${qs}` : "/coffees";
}
