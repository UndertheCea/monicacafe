// Pure helpers for the /map page. Kept free of runtime imports so they can be
// unit-tested with `node --test` (Node strips the type annotations natively).
import type { ShopPin } from "./api";

/** A pin that can actually be placed on the map. */
export type PlacedShopPin = ShopPin & { lat: number; lng: number };

function isCoord(v: unknown, limit: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
}

/** Split pins into those with valid coordinates and those without. */
export function partitionPins(pins: ShopPin[]): { placed: PlacedShopPin[]; unplaced: ShopPin[] } {
  const placed: PlacedShopPin[] = [];
  const unplaced: ShopPin[] = [];
  for (const p of pins) {
    if (isCoord(p.lat, 90) && isCoord(p.lng, 180)) {
      placed.push({ ...p, lat: p.lat, lng: p.lng });
    } else {
      unplaced.push(p);
    }
  }
  return { placed, unplaced };
}
