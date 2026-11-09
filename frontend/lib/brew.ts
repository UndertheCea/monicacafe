/**
 * What a coffee is roasted for (#122): filter (手沖), espresso (義式) or omni
 * (both). Null or an unknown value (a newer API) means "not given" and is left
 * out everywhere. Import-free apart from types, so `npm test` loads it directly.
 */
import type { BrewMethod } from "./coffeeQuery";

const METHODS: readonly string[] = ["FILTER", "ESPRESSO", "OMNI"];

/** The API value when it's one we know, else null. */
export function knownBrewMethod(m: string | null | undefined): BrewMethod | null {
  return m && METHODS.includes(m) ? (m as BrewMethod) : null;
}

/** Label key for the coffee page and forms: omni spells out that it suits both. */
export function brewLongKey(m: string | null | undefined): "brew.FILTER" | "brew.ESPRESSO" | "brew.OMNI_LONG" | null {
  const k = knownBrewMethod(m);
  if (!k) return null;
  return k === "OMNI" ? "brew.OMNI_LONG" : `brew.${k}`;
}
