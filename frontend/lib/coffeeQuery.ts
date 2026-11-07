// URL ⇄ API mapping for /coffees options that aren't plain filters. No
// imports, so `npm test` can load it directly.

export type CoffeeSort = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "MOST_DISCUSSED";

export type RoastLevel = "LIGHT" | "MEDIUM" | "MEDIUM_DARK" | "DARK";
export const ROAST_LEVELS: RoastLevel[] = ["LIGHT", "MEDIUM", "MEDIUM_DARK", "DARK"];

/** Parse `?roast=` (case-insensitive); anything unknown → undefined (all roasts). */
export function parseRoastParam(v: string | string[] | undefined): RoastLevel | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().toUpperCase() ?? "";
  return (ROAST_LEVELS as string[]).includes(s) ? (s as RoastLevel) : undefined;
}

/** `?sort=` values in the order the dropdown lists them ("" = newest, the default). */
export const SORT_PARAMS = ["", "price_asc", "price_desc", "discussed"] as const;
export type SortParam = (typeof SORT_PARAMS)[number];

const TO_API: Record<SortParam, CoffeeSort> = {
  "": "NEWEST",
  price_asc: "PRICE_ASC",
  price_desc: "PRICE_DESC",
  discussed: "MOST_DISCUSSED",
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
 * A shop page URL (page 1) for a keyword search, roast and sort. Blank and
 * default values are left out, so clearing everything gives /shops/<slug>.
 */
export function shopCoffeesHref(slug: string, p: { q?: string; roast?: RoastLevel; sort?: SortParam }): string {
  const params = new URLSearchParams();
  const q = p.q?.trim();
  if (q) params.set("q", q);
  if (p.roast) params.set("roast", p.roast);
  if (p.sort) params.set("sort", p.sort);
  const qs = params.toString();
  return `/shops/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
}
