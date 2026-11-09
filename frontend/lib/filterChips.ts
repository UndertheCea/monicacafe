// Removable "chips" for the filters narrowing a coffee list: one per active
// filter, each linking to the same list without it. Built from the parsed
// (validated) filter, so a junk URL value never shows as a chip. Type-only
// imports, so `npm test` can load it directly.

/** The parsed filter fields chips are made from (a subset of CoffeeFilter). */
export interface ChipFilter {
  originCountryId?: string;
  varietyId?: string;
  processingMethodId?: string;
  minPriceTwd?: number;
  maxPriceTwd?: number;
  inStock?: boolean;
}

export type FilterChip =
  | { kind: "origin" | "variety" | "process"; id: string; href: string }
  | { kind: "price"; min?: number; max?: number; href: string }
  | { kind: "instock"; href: string };

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
  if (f.minPriceTwd !== undefined || f.maxPriceTwd !== undefined) {
    out.push({ kind: "price", min: f.minPriceTwd, max: f.maxPriceTwd, href: without("min", "max") });
  }
  if (f.inStock) out.push({ kind: "instock", href: without("instock") });
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
