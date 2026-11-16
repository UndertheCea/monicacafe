import type { MessageKey } from "./i18n/dict";

/**
 * The dictionary key for a listing's "N coffees" / "N shops" line: singular
 * for exactly one, plural otherwise (zh-TW reads the same either way).
 */
export function listCountKey(base: "coffees.count" | "shops.count", n: number): MessageKey {
  const one = n === 1;
  if (base === "coffees.count") return one ? "coffees.count.one" : "coffees.count.other";
  return one ? "shops.count.one" : "shops.count.other";
}
