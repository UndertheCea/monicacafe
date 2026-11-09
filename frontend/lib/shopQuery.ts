// URL ⇄ API mapping for the /shops sort. No imports, so `npm test` can load it
// directly.

export type ShopSort = "NEWEST" | "NAME" | "MOST_COFFEES" | "MOST_FOLLOWED";

/** `?sort=` values in the order the dropdown lists them ("" = newest, the default). */
export const SHOP_SORT_PARAMS = ["", "name", "coffees", "followers"] as const;
export type ShopSortParam = (typeof SHOP_SORT_PARAMS)[number];

const TO_API: Record<ShopSortParam, ShopSort> = {
  "": "NEWEST",
  name: "NAME",
  coffees: "MOST_COFFEES",
  followers: "MOST_FOLLOWED",
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

/**
 * A /shops URL for a search + sort (page 1). Blank / default values are left
 * out, so "clear search" with the default sort is just /shops.
 */
export function shopListHref(p: { q?: string; sort?: ShopSortParam }): string {
  const params = new URLSearchParams();
  const q = p.q?.trim();
  if (q) params.set("q", q);
  if (p.sort) params.set("sort", p.sort);
  const qs = params.toString();
  return qs ? `/shops?${qs}` : "/shops";
}

/** The shop page's two paged lists: the current lineup and the sold-out archive (#163). */
export interface ShopPagePages {
  page: number;
  archive: number;
}

/** `?page=` and `?archive=` on a shop page; anything not a positive integer is page 1. */
export function parseShopPagePages(sp: Record<string, string | string[] | undefined>): ShopPagePages {
  const num = (v: string | string[] | undefined) => {
    const n = Number.parseInt((Array.isArray(v) ? v[0] : v) ?? "", 10);
    return Number.isFinite(n) && n > 1 ? n : 1;
  };
  return { page: num(sp.page), archive: num(sp.archive) };
}

/**
 * A shop page URL for a lineup page and an archive page, page 1 left out, so
 * paging one list keeps the other where it was. An archive page links to the
 * archive heading.
 */
export function shopPageHref(slug: string, p: ShopPagePages, anchor?: "archive"): string {
  const params = new URLSearchParams();
  if (p.page > 1) params.set("page", String(p.page));
  if (p.archive > 1) params.set("archive", String(p.archive));
  const qs = params.toString();
  return `/shops/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}${anchor ? `#${anchor}` : ""}`;
}
