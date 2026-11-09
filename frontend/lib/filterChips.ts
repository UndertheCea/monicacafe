// Removable "chips" for the filters narrowing a coffee list: one per active
// filter, each linking to the same list without it. Built from the parsed
// (validated) filter, so a junk URL value never shows as a chip. Type-only
// imports, so `npm test` can load it directly.
import type { BrewMethod, RoastLevel } from "./coffeeQuery";

/** The parsed filter fields chips are made from (a subset of CoffeeFilter). */
export interface ChipFilter {
  originCountryId?: string;
  varietyId?: string;
  processingMethodId?: string;
  roastLevel?: RoastLevel;
  brewMethod?: BrewMethod;
  flavorNote?: string;
  minPriceTwd?: number;
  maxPriceTwd?: number;
  inStock?: boolean;
  minHarvestYear?: number;
  maxAcidity?: number;
  minSweetness?: number;
  minBody?: number;
  maxBody?: number;
  minAltitudeM?: number;
}

export type FilterChip =
  | { kind: "origin" | "variety" | "process"; id: string; href: string }
  | { kind: "roast"; value: RoastLevel; href: string }
  | { kind: "brew"; value: BrewMethod; href: string }
  | { kind: "flavor"; value: string; href: string }
  | { kind: "price"; min?: number; max?: number; href: string }
  | { kind: "body"; value: "light" | "full"; href: string }
  | { kind: "harvest"; year: number; href: string }
  | { kind: "instock" | "acidity" | "sweet" | "altitude"; href: string };

type Params = Record<string, string | string[] | undefined>;

/**
 * `base` with the current params minus `drop` (and minus `page`, so removing a
 * filter goes back to page 1). Repeated params keep their first value, as the
 * parsers read them.
 */
export function hrefWithout(base: string, sp: Params, drop: readonly string[]): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    if (s && k !== "page" && !drop.includes(k)) params.set(k, s);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * The chips for a parsed filter, in sidebar order. `sp` is the raw query
 * string (to rebuild each "without" link) and `base` the list's path
 * (/coffees or /shops/<slug>). Search and sort are not filters: they stay.
 */
export function filterChips(f: ChipFilter, sp: Params, base: string): FilterChip[] {
  const out: FilterChip[] = [];
  const without = (...p: string[]) => hrefWithout(base, sp, p);
  if (f.originCountryId) out.push({ kind: "origin", id: f.originCountryId, href: without("origin") });
  if (f.varietyId) out.push({ kind: "variety", id: f.varietyId, href: without("variety") });
  if (f.processingMethodId) out.push({ kind: "process", id: f.processingMethodId, href: without("process") });
  if (f.roastLevel) out.push({ kind: "roast", value: f.roastLevel, href: without("roast") });
  if (f.brewMethod) out.push({ kind: "brew", value: f.brewMethod, href: without("brew") });
  if (f.flavorNote) out.push({ kind: "flavor", value: f.flavorNote, href: without("flavor") });
  if (f.minPriceTwd !== undefined || f.maxPriceTwd !== undefined) {
    out.push({ kind: "price", min: f.minPriceTwd, max: f.maxPriceTwd, href: without("min", "max") });
  }
  if (f.inStock) out.push({ kind: "instock", href: without("instock") });
  if (f.minHarvestYear !== undefined) out.push({ kind: "harvest", year: f.minHarvestYear, href: without("harvest") });
  if (f.maxAcidity !== undefined) out.push({ kind: "acidity", href: without("acidity") });
  if (f.minSweetness !== undefined) out.push({ kind: "sweet", href: without("sweet") });
  if (f.minAltitudeM !== undefined) out.push({ kind: "altitude", href: without("altitude") });
  if (f.maxBody !== undefined) out.push({ kind: "body", value: "light", href: without("body") });
  else if (f.minBody !== undefined) out.push({ kind: "body", value: "full", href: without("body") });
  return out;
}

/** The dictionary key + vars for a price chip: a range, a floor or a ceiling. */
export function priceChipLabel(min?: number, max?: number): { key: "chip.priceRange" | "chip.priceMin" | "chip.priceMax"; vars: Record<string, number> } {
  if (min !== undefined && max !== undefined) return { key: "chip.priceRange", vars: { min, max } };
  if (min !== undefined) return { key: "chip.priceMin", vars: { min } };
  return { key: "chip.priceMax", vars: { max: max ?? 0 } };
}

/**
 * How many filters narrow the list (search and sort don't count): the number
 * of chips, so the phone toggle's "Filters (N)" matches what the chips show.
 */
export function activeFilterCount(f: ChipFilter): number {
  return filterChips(f, {}, "/").length;
}
