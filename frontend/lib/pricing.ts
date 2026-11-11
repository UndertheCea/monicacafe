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

/**
 * What a buyer sees first on a coffee: no options yet, sold out (no option is
 * both available and in stock), or the cheapest buyable option's price and its
 * NT$ per 100 g. The page's headline and the JSON-LD availability both use it.
 */
export function coffeeAvailability(variants: AvailabilityVariant[]): CoffeeAvailability {
  if (variants.length === 0) return { kind: "none" };
  let best: AvailabilityVariant | null = null;
  for (const v of variants) {
    if (v.isAvailable && v.stock > 0 && (best === null || v.priceTwd < best.priceTwd)) best = v;
  }
  if (best === null) return { kind: "soldOut" };
  return { kind: "from", price: best.priceTwd, per100g: pricePer100g(best.priceTwd, best.weightG) };
}
