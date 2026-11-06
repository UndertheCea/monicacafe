// URL ⇄ API mapping for /coffees options that aren't plain filters. No
// imports, so `npm test` can load it directly.

export type CoffeeSort = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "MOST_DISCUSSED";

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
