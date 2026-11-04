import { ROAST_LEVELS, type CoffeeFilter, type RoastLevel } from "./api";

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

/** Parse `/coffees?origin=…&roast=…&page=2` into a CoffeeFilter + page. */
export function parseCoffeeSearch(sp: SearchParams): { filter: CoffeeFilter; page: number } {
  const roast = one(sp.roast);
  const filter: CoffeeFilter = {
    originCountryId: one(sp.origin),
    varietyId: one(sp.variety),
    processingMethodId: one(sp.process),
    roastLevel: ROAST_LEVELS.includes(roast as RoastLevel) ? (roast as RoastLevel) : undefined,
    flavorNote: one(sp.flavor),
    minPriceTwd: wholeNTD(one(sp.min)),
    maxPriceTwd: wholeNTD(one(sp.max)),
  };
  // Drop undefined keys so the GraphQL variables stay minimal.
  for (const k of Object.keys(filter) as (keyof CoffeeFilter)[]) {
    if (filter[k] === undefined) delete filter[k];
  }
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { filter, page };
}

/** Build a /coffees URL preserving current params, overriding `page`. */
export function pageHref(sp: SearchParams, page: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s && k !== "page") params.set(k, s);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/coffees?${qs}` : "/coffees";
}
