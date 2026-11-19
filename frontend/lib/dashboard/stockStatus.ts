// Restock hints for the dashboard coffee list. Imports only lib/pricing.ts (itself import-free), so `npm test` loads it.
import { isBuyable } from "../pricing.ts";

/** At or below this many bags across in-stock options, a coffee is "low". */
export const LOW_STOCK = 5;

export type StockStatus =
  | { kind: "none" } // no options yet
  | { kind: "out" } // no available option with stock: buyers see "sold out"
  | { kind: "low"; units: number }
  | { kind: "ok"; units: number };

/** How a coffee's options add up for restocking. Only buyable options count (available, in stock, at least NT$1: #414). */
export function stockStatus(variants: { stock: number; isAvailable: boolean; priceTwd: number }[]): StockStatus {
  if (variants.length === 0) return { kind: "none" };
  const units = variants.reduce((n, v) => (isBuyable(v) ? n + v.stock : n), 0);
  if (units === 0) return { kind: "out" };
  return units <= LOW_STOCK ? { kind: "low", units } : { kind: "ok", units };
}
