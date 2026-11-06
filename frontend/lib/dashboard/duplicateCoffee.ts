// Pure helpers for "Duplicate" on the dashboard (duplicateCoffee mutation).
import type { MessageKey } from "../i18n/dict";

/** Longest coffee name the API accepts, in characters (code points). */
export const MAX_COFFEE_NAME = 120;

/**
 * The copy's name: `name` + `suffix`, trimming the end of `name` so the
 * result fits MAX_COFFEE_NAME (counted by code points, like the API).
 */
export function copyName(name: string, suffix: string): string {
  const room = MAX_COFFEE_NAME - [...suffix].length;
  const chars = [...name.trim()];
  const base = chars.length > room ? chars.slice(0, Math.max(0, room)).join("").trimEnd() : chars.join("");
  return base + suffix;
}

/** Message for a failed duplicateCoffee, by API error code. */
export function duplicateCoffeeErrorKey(code: string): MessageKey {
  if (code === "NOT_FOUND" || code === "FORBIDDEN") return "cf.notYours";
  return "dash.error.generic";
}
