// Pure helpers for "Duplicate" on the dashboard (duplicateCoffee mutation).
import type { MessageKey } from "../i18n/dict";
import { moderationBlockKey } from "./takedown.ts";
import { dashWriteError, type DashWriteError } from "./writeError.ts";

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

/** Most coffees a shop may have, drafts included (backend graph.MaxCoffeesPerShop). */
export const MAX_COFFEES_PER_SHOP = 200;

/** Message for a failed duplicateCoffee, by API error code. */
export function duplicateCoffeeErrorKey(code: string): MessageKey {
  const blocked = moderationBlockKey(code);
  if (blocked) return blocked;
  if (code === "LIMIT_REACHED") return "dash.error.coffeeLimit";
  if (code === "NOT_FOUND" || code === "FORBIDDEN") return "cf.notYours";
  return "dash.error.generic";
}

/** Message for a failed duplicateCoffee, with the wait when the seller duplicated too often (#532). */
export function duplicateCoffeeError(code: string, retryAfter?: number): DashWriteError {
  return dashWriteError(code, retryAfter) ?? { key: duplicateCoffeeErrorKey(code), vars: { max: MAX_COFFEES_PER_SHOP } };
}
