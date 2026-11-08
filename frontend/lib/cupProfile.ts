/**
 * A coffee's cup profile (#136): 酸度 / 甜度 / 醇厚度 (acidity / sweetness /
 * body), each 1 (low) to 5 (high). Null, or a value the API couldn't have
 * stored, means "not given". Import-free, so `npm test` loads it directly.
 */

export const CUP_SCALES = ["acidity", "sweetness", "body"] as const;
export type CupScale = (typeof CUP_SCALES)[number];
export const CUP_MIN = 1;
export const CUP_MAX = 5;

export type CupProfile = Record<CupScale, number | null>;

/** The value when it's a whole number 1–5, else null. */
export function knownCupValue(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= CUP_MIN && v <= CUP_MAX ? v : null;
}

/** The scales a coffee has, in display order, skipping unset or invalid ones. */
export function cupScalesOf(c: Partial<Record<CupScale, number | null>>): { scale: CupScale; value: number }[] {
  const out: { scale: CupScale; value: number }[] = [];
  for (const scale of CUP_SCALES) {
    const value = knownCupValue(c[scale]);
    if (value !== null) out.push({ scale, value });
  }
  return out;
}
