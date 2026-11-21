// Price helpers. Prices are whole NT$ integers; no float math on them.
// Import-free so `npm test` loads it directly.

/**
 * NT$ per 100 g, rounded half up to a whole dollar using integer arithmetic.
 * null when the weight or price isn't a usable integer (weight ≤ 0, price < 0).
 */
export function pricePer100g(priceTwd: number, weightG: number): number | null {
  if (!Number.isSafeInteger(priceTwd) || !Number.isSafeInteger(weightG) || weightG <= 0 || priceTwd < 0) {
    return null;
  }
  // round(price * 100 / weight) = floor((2 * price * 100 + weight) / (2 * weight))
  const num = 200 * priceTwd + weightG;
  const den = 2 * weightG;
  return (num - (num % den)) / den;
}

/**
 * The per-100 g price worth showing: null for a 100 g bag (it would repeat the
 * price) and for weights / prices pricePer100g rejects (#460).
 */
export function per100gShown(priceTwd: number, weightG: number): number | null {
  return weightG === 100 ? null : pricePer100g(priceTwd, weightG);
}

export interface AvailabilityVariant {
  priceTwd: number;
  weightG: number;
  stock: number;
  isAvailable: boolean;
}

export type CoffeeAvailability =
  | { kind: "none" }
  | { kind: "soldOut" }
  | { kind: "from"; price: number; per100g: number | null };

export type VariantState = { kind: "inStock"; n: number } | { kind: "soldOut" };

/**
 * Whether a buyer can pick an option now: available, in stock and at least
 * NT$1, the API's rule for the catalogue and the cart (#358). An NT$0 option
 * stored before that rule reads as sold out.
 */
export function isBuyable(v: { stock: number; isAvailable: boolean; priceTwd: number }): boolean {
  return v.isAvailable && v.stock > 0 && v.priceTwd >= 1;
}

/** One option's stock cell: in stock only when it is buyable (same rule as coffeeAvailability). */
export function variantState(v: { stock: number; isAvailable: boolean; priceTwd: number }): VariantState {
  return isBuyable(v) ? { kind: "inStock", n: v.stock } : { kind: "soldOut" };
}

/**
 * What a buyer sees first on a coffee: no options yet, sold out (no option is
 * both available and in stock), or the cheapest buyable option's price and its
 * NT$ per 100 g. The page's headline and the JSON-LD availability both use it.
 */
export function coffeeAvailability(variants: AvailabilityVariant[]): CoffeeAvailability {
  if (variants.length === 0) return { kind: "none" };
  let best: AvailabilityVariant | null = null;
  for (const v of variants) {
    if (isBuyable(v) && (best === null || v.priceTwd < best.priceTwd)) best = v;
  }
  if (best === null) return { kind: "soldOut" };
  return { kind: "from", price: best.priceTwd, per100g: per100gShown(best.priceTwd, best.weightG) };
}

/**
 * Lowest buyable variant price in whole NT$, or null if sold out. Same rule as the coffee page's
 * `isBuyable` (#358, #393): `isAvailable` already means on sale and in stock, and a stored NT$0 option
 * reads as sold out rather than "from NT$0".
 */
export function fromPrice(c: { variants: { priceTwd: number; isAvailable: boolean }[] }): number | null {
  const prices = c.variants.filter((v) => v.isAvailable && v.priceTwd >= 1).map((v) => v.priceTwd);
  return prices.length ? Math.min(...prices) : null;
}
