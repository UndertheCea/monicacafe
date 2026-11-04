// Pure helpers for the /map page. No `@/` imports so `node --test` can load
// this file directly (see lib/map.test.ts).

/** A shop pin as returned by the `shopsForMap` query. */
export interface ShopPin {
  id: string;
  slug: string;
  name: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

/** A pin whose coordinates are known to be usable. */
export type LocatedPin = ShopPin & { lat: number; lng: number };

/** Roughly the geographic centre of Taiwan; used when there are no pins. */
export const TAIWAN_CENTER: [number, number] = [23.7, 120.96];
export const TAIWAN_ZOOM = 7;

/** Keep pins with finite, in-range coordinates. */
export function locatedPins(pins: ShopPin[]): LocatedPin[] {
  return pins.filter(
    (p): p is LocatedPin =>
      typeof p.lat === "number" &&
      typeof p.lng === "number" &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lng) <= 180,
  );
}

/**
 * Group pins by city, preserving the first-seen order of cities and the
 * order of pins within each city. Shops with an empty city go last under "".
 */
export function groupByCity<T extends { city: string }>(pins: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const p of pins) {
    const key = p.city.trim();
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  const entries = [...groups.entries()];
  return [...entries.filter(([c]) => c !== ""), ...entries.filter(([c]) => c === "")];
}

/** [[south, west], [north, east]] covering every pin, or null when empty. */
export function boundsOf(pins: LocatedPin[]): [[number, number], [number, number]] | null {
  if (pins.length === 0) return null;
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const p of pins) {
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
  }
  return [[s, w], [n, e]];
}
