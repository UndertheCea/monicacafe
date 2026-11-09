import type { CoffeeFilter } from "./api";
import { parseInStockParam, parseSearchParam, parseSortParam, type SortParam } from "./coffeeQuery";

export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 12;

function one(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
}

function wholeNTD(v: string | undefined): number | undefined {
  if (!v || !/^\d{1,7}$/.test(v)) return undefined;
  return Number(v);
}

/**
 * Parse `/coffees?q=…&origin=…&variety=…&process=…&min=…&max=…&instock=1&sort=…&page=2`
 * into a CoffeeFilter, sort + page. The roast, brew, flavour, harvest and
 * cup-profile params the page once had (`?roast`, `?brew`, `?flavor`,
 * `?harvest`, `?acidity`, `?sweet`, `?body`, `?altitude`) are ignored, so old
 * links show the unfiltered list (owner, #166).
 */
export function parseCoffeeSearch(sp: SearchParams): { filter: CoffeeFilter; sort: SortParam; page: number } {
  const filter: CoffeeFilter = {
    originCountryId: one(sp.origin),
    varietyId: one(sp.variety),
    processingMethodId: one(sp.process),
    search: parseSearchParam(sp.q),
    minPriceTwd: wholeNTD(one(sp.min)),
    maxPriceTwd: wholeNTD(one(sp.max)),
    inStock: parseInStockParam(sp.instock) || undefined,
  };
  // Drop undefined keys so the GraphQL variables stay minimal.
  for (const k of Object.keys(filter) as (keyof CoffeeFilter)[]) {
    if (filter[k] === undefined) delete filter[k];
  }
  return { filter, sort: parseSortParam(sp.sort), page: parsePage(sp) };
}

/** Parse a 1-based `?page=` param (anything invalid → 1). */
export function parsePage(sp: SearchParams): number {
  return Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
}

/** Build a URL on `base` preserving current params, overriding `page`. */
export function pageHref(sp: SearchParams, page: number, base = "/coffees"): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s && k !== "page") params.set(k, s);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
