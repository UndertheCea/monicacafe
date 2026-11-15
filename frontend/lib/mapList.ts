// The text list under /map (#294): cities with their shop counts, each showing a few shops and "N more", so the
// page doesn't grow with every shop that joins. Shops without coordinates are listed like any other.

export const MAP_LIST_SHOPS_PER_CITY = 5;

interface Listed {
  city: string;
}

export interface CityGroup<T extends Listed> {
  city: string;
  count: number;
  shops: T[];
  /** Shops of this city not shown. */
  more: number;
}

/** Cities with the most shops first (ties by name, zh-TW collation); each keeps its first `limit` shops in order. */
export function cityGroups<T extends Listed>(pins: T[], limit = MAP_LIST_SHOPS_PER_CITY): CityGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const p of pins) {
    const city = p.city?.trim() || "—";
    const list = groups.get(city);
    if (list) list.push(p);
    else groups.set(city, [p]);
  }
  return [...groups.entries()]
    .map(([city, list]) => ({ city, count: list.length, shops: list.slice(0, limit), more: Math.max(0, list.length - limit) }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "zh-TW"));
}
