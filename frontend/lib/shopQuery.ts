// URL ⇄ API mapping for the /shops sort. No imports, so `npm test` can load it
// directly.

export type ShopSort = "NEWEST" | "NAME" | "MOST_COFFEES";

/** `?sort=` values in the order the dropdown lists them ("" = newest, the default). */
export const SHOP_SORT_PARAMS = ["", "name", "coffees"] as const;
export type ShopSortParam = (typeof SHOP_SORT_PARAMS)[number];

const TO_API: Record<ShopSortParam, ShopSort> = {
  "": "NEWEST",
  name: "NAME",
  coffees: "MOST_COFFEES",
};

/** Parse `/shops?sort=`; anything unknown falls back to newest (""). */
export function parseShopSortParam(v: string | string[] | undefined): ShopSortParam {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() ?? "";
  return (SHOP_SORT_PARAMS as readonly string[]).includes(s) ? (s as ShopSortParam) : "";
}

/** The GraphQL `sort` argument for a `?sort=` value. */
export function shopSortForApi(p: ShopSortParam): ShopSort {
  return TO_API[p];
}
