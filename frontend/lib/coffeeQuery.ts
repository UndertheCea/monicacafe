// URL ⇄ API mapping for /coffees options that aren't plain filters. No
// imports, so `npm test` can load it directly.

export type CoffeeSort = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "MOST_DISCUSSED" | "MOST_SAVED";

export type RoastLevel = "LIGHT" | "MEDIUM" | "MEDIUM_DARK" | "DARK";
export const ROAST_LEVELS: RoastLevel[] = ["LIGHT", "MEDIUM", "MEDIUM_DARK", "DARK"];

/** What a coffee is roasted for (API enum BrewMethod). OMNI suits both. */
export type BrewMethod = "FILTER" | "ESPRESSO" | "OMNI";
export const BREW_METHODS: BrewMethod[] = ["FILTER", "ESPRESSO", "OMNI"];

/** Parse `?roast=` (case-insensitive); anything unknown → undefined (all roasts). */
export function parseRoastParam(v: string | string[] | undefined): RoastLevel | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().toUpperCase() ?? "";
  return (ROAST_LEVELS as string[]).includes(s) ? (s as RoastLevel) : undefined;
}

/**
 * Parse `?brew=` (filter / espresso / omni, any case); anything unknown →
 * undefined (every coffee). The API also returns omni roasts for filter and
 * espresso.
 */
export function parseBrewParam(v: string | string[] | undefined): BrewMethod | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().toUpperCase() ?? "";
  return (BREW_METHODS as string[]).includes(s) ? (s as BrewMethod) : undefined;
}

/** The `?brew=` value for a brew method (lowercase reads better in a URL). */
export function brewParam(m: BrewMethod): string {
  return m.toLowerCase();
}

/** `?harvest=recent` (any case) → true: only recent crops; anything else → every coffee. */
export function parseHarvestParam(v: string | string[] | undefined): boolean {
  return (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() === "recent";
}

/** `?acidity=low` (any case) → true: only low-acid coffees; anything else → every coffee. */
export function parseAcidityParam(v: string | string[] | undefined): boolean {
  return (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() === "low";
}

/**
 * The highest acidity (1–5) "low acidity" covers: 1 and 2, the bottom two
 * steps of the scale sellers pick from (CoffeeFilter.maxAcidity).
 */
export const LOW_ACIDITY_MAX = 2;

/** `?sweet=high` (any case) → true: only sweet coffees; anything else → every coffee. */
export function parseSweetParam(v: string | string[] | undefined): boolean {
  return (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() === "high";
}

/** The lowest sweetness (1–5) "sweet" covers: 4 and 5, the top two steps. */
export const SWEET_MIN = 4;

/** `?body=` values: light (1–2 of 5) or full (4–5 of 5). */
export type BodyParam = "light" | "full";
export const BODY_PARAMS: BodyParam[] = ["light", "full"];

/** Parse `?body=` (light / full, any case); anything else → undefined (every coffee). */
export function parseBodyParam(v: string | string[] | undefined): BodyParam | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() ?? "";
  return (BODY_PARAMS as string[]).includes(s) ? (s as BodyParam) : undefined;
}

/** Light body = 1–2, full body = 4–5: the outer two steps at each end, like acidity and sweetness. */
export const LIGHT_BODY_MAX = 2;
export const FULL_BODY_MIN = 4;

/** `?altitude=high` (any case) → true: only high-grown coffees; anything else → every coffee. */
export function parseAltitudeParam(v: string | string[] | undefined): boolean {
  return (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() === "high";
}

/**
 * The growing altitude in metres "high-grown" starts at (CoffeeFilter.minAltitudeM,
 * judged by the top of a coffee's range): the line roasters usually print for
 * hard-bean, high-grown lots.
 */
export const HIGH_GROWN_MIN_M = 1500;

/** The URL's cup-profile choices (see the parsers above). */
export interface CupChoices {
  lowAcid?: boolean;
  sweet?: boolean;
  body?: BodyParam;
}

/**
 * The CoffeeFilter fields for the cup-profile choices; keys that don't apply
 * are left out so the GraphQL variables stay minimal.
 */
export function cupFilter(c: CupChoices): { maxAcidity?: number; minSweetness?: number; minBody?: number; maxBody?: number } {
  return {
    ...(c.lowAcid ? { maxAcidity: LOW_ACIDITY_MAX } : {}),
    ...(c.sweet ? { minSweetness: SWEET_MIN } : {}),
    ...(c.body === "light" ? { maxBody: LIGHT_BODY_MAX } : {}),
    ...(c.body === "full" ? { minBody: FULL_BODY_MIN } : {}),
  };
}

/**
 * The earliest crop year "recent harvest" covers: last year in Taiwan (UTC+8,
 * no DST), so this year's and last year's crops. Green coffee ships for a year
 * or more after harvest, so last year's crop is still the current one for many
 * origins. (lib/dashboard/validate.ts computes the Taipei year the same way.)
 */
export function recentHarvestFrom(now: Date = new Date()): number {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCFullYear() - 1;
}

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
 * keyword search (origin, roast, price, in stock, cup profile, …).
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

/**
 * A shop page URL (page 1) for a keyword search, roast and sort. Blank and
 * default values are left out, so clearing everything gives /shops/<slug>.
 */
export function shopCoffeesHref(
  slug: string,
  p: { q?: string; roast?: RoastLevel; brew?: BrewMethod; harvest?: boolean; highGrown?: boolean; sort?: SortParam } & CupChoices,
): string {
  const params = new URLSearchParams();
  const q = p.q?.trim();
  if (q) params.set("q", q);
  if (p.roast) params.set("roast", p.roast);
  if (p.brew) params.set("brew", brewParam(p.brew));
  if (p.harvest) params.set("harvest", "recent");
  if (p.lowAcid) params.set("acidity", "low");
  if (p.sweet) params.set("sweet", "high");
  if (p.body) params.set("body", p.body);
  if (p.highGrown) params.set("altitude", "high");
  if (p.sort) params.set("sort", p.sort);
  const qs = params.toString();
  return `/shops/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
}
