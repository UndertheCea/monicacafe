/**
 * A coffee's harvest year (產季, #129): the year its harvest ended. Null, or a
 * value outside the API's 2000–2100 range, means "not given" and is left out
 * everywhere. Import-free, so `npm test` loads it directly.
 */

/** The year when it's a whole year the API could have stored, else null. */
export function knownHarvestYear(y: number | null | undefined): number | null {
  return typeof y === "number" && Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null;
}
