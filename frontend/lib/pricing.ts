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
