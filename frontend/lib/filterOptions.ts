// Which reference values (origins, varieties, processes) the /coffees sidebar
// offers. No imports, so `npm test` can load it directly.

/** A dropdown value with how many published coffees use it (API coffeeCount). */
export interface CountedOption {
  id: string;
  coffeeCount: number;
}

/**
 * The options worth offering: those with published coffees, plus the one the
 * URL already selects (so a shared link to a now-empty origin still shows what
 * is selected rather than silently reading "Any"). Order is kept.
 */
export function optionsWithCoffees<T extends CountedOption>(list: readonly T[], selectedId?: string): T[] {
  return list.filter((o) => o.coffeeCount > 0 || o.id === selectedId);
}

/**
 * Origins grouped by region for one <optgroup> each, in first-seen order;
 * regions left with no origins don't appear.
 */
export function groupByRegion<T extends { region: string }>(list: readonly T[]): [string, T[]][] {
  const regions = new Map<string, T[]>();
  for (const o of list) regions.set(o.region, [...(regions.get(o.region) ?? []), o]);
  return [...regions];
}

const REGION_KEYS: Record<string, string> = {
  Africa: "region.africa",
  Americas: "region.americas",
  "Asia-Pacific": "region.asiaPacific",
  "Middle East": "region.middleEast",
};

/** The dictionary key for a stored origin region, or null for one we have no translation for. */
export function regionKey(region: string): string | null {
  return Object.hasOwn(REGION_KEYS, region) ? REGION_KEYS[region] : null;
}
