// Restock hints for the dashboard coffee list. Import-free so `npm test` loads it.

/** At or below this many bags across in-stock options, a coffee is "low". */
export const LOW_STOCK = 5;

export type StockStatus =
  | { kind: "none" } // no options yet
  | { kind: "out" } // no available option with stock: buyers see "sold out"
  | { kind: "low"; units: number }
  | { kind: "ok"; units: number };

/** How a coffee's options add up for restocking. Only available options count. */
export function stockStatus(variants: { stock: number; isAvailable: boolean }[]): StockStatus {
  if (variants.length === 0) return { kind: "none" };
  const units = variants.reduce((n, v) => (v.isAvailable && v.stock > 0 ? n + v.stock : n), 0);
  if (units === 0) return { kind: "out" };
  return units <= LOW_STOCK ? { kind: "low", units } : { kind: "ok", units };
}
