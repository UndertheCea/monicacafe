import { t, type Locale, type MessageKey } from "./i18n/dict.ts";

/**
 * Message bases that have both a `<base>.one` and a `<base>.other` entry in
 * the dictionary. English needs the singular form for a count of 1
 * ("1 comment"); zh-TW has the same text in both.
 */
export type PluralBase =
  | "coffees.count"
  | "shops.count"
  | "coffees.comments"
  | "shops.coffeesCount"
  | "dash.variantsCount"
  | "map.count"
  | "map.moreShops"
  | "comments.remaining"
  | "error.rateLimitedSec"
  | "error.rateLimitedMin";

/** The message key for a count: `<base>.one` when n is 1, else `<base>.other`. */
export function pluralKey(base: PluralBase, n: number): MessageKey {
  return `${base}.${n === 1 ? "one" : "other"}`;
}

/**
 * A count for a card, or null when there is nothing to count: cards print "3 comments" but never
 * "0 comments" (#552 E, #559). Detail pages say "0" where the number is the point (comment heading, save button).
 */
export function cardCount(locale: Locale, base: PluralBase, n: number): string | null {
  return n > 0 ? t(locale, pluralKey(base, n), { n }) : null;
}
