// The language switch as a plain form (#367): /menu has to work without
// JavaScript, so the toggle posts {locale, next} to /api/locale, which sets the
// same `locale` cookie the script path sets. Pure, so `npm test` can load it.
import { safeNext } from "../auth/token.ts";
import { isLocale, type Locale } from "./dict.ts";

/** The cookie's attributes, shared by the script path and the route handler. */
export const LOCALE_COOKIE_PATH = "/";
export const LOCALE_COOKIE_MAX_AGE = 31536000;

/** The `document.cookie` string the toggle writes when JavaScript runs. */
export function localeCookieString(name: string, locale: Locale): string {
  return `${name}=${locale}; path=${LOCALE_COOKIE_PATH}; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

/** Validate the posted form: a known locale and a same-site path (else "/"). Null when the locale is bad. */
export function parseLocaleForm(
  locale: FormDataEntryValue | null,
  next: FormDataEntryValue | null,
): { locale: Locale; next: string } | null {
  if (typeof locale !== "string" || !isLocale(locale)) return null;
  return { locale, next: safeNext(typeof next === "string" ? next : null, "/", true) };
}

/** Where the toggle sends the visitor back to: the path plus its query string (none when empty). */
export function nextWithSearch(pathname: string, search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return q ? `${pathname}?${q}` : pathname;
}
