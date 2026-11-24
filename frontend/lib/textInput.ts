// Pure helpers for naming why the API refused a text field (#341). Loadable by `node --test`.
import type { MessageKey } from "./i18n/dict";

/** Characters in a trimmed value, counted like the API does (code points, not UTF-16 units). */
export function textLength(value: string): number {
  return [...value.trim()].length;
}

/**
 * `value` cut to at most `max` characters (code points, like the API), for fields that have no
 * "too long" message of their own. Native `maxLength` counts UTF-16 units and would stop an
 * astral-character text (𠮷, emoji) at half the limit (#395).
 */
export function capChars(value: string, max: number): string {
  const chars = [...value];
  return chars.length > max ? chars.slice(0, max).join("") : value;
}

/** capChars applied to an uncontrolled input in place (only touches the value when it is over the limit). */
export function capInput(el: { value: string }, max: number): void {
  const v = capChars(el.value, max);
  if (v !== el.value) el.value = v;
}

/**
 * Characters the API refuses in text (backend/graph/helpers.go `badTextRune`): control and invisible formatting
 * ones (Cc / Cf, e.g. a zero-width space), plus letters that render blank (twfmt `isBlankLooking`: Hangul
 * fillers, the Braille blank, Khmer inherent vowels). A Go test keeps the blank-looking list in step (#502).
 */
const REFUSED_CHAR = /[\p{Cc}\p{Cf}\u115F\u1160\u3164\uFFA0\u2800\u17B4\u17B5]/u;
/** Something that draws on its own: not space, the zero-width joiner, or a combining / enclosing mark (`hasVisibleRune`). */
const VISIBLE_CHAR = /[^\s\u200D\p{Mn}\p{Me}]/u;

/**
 * Whether the text holds characters the API refuses as invisible, or draws nothing at all (only joiners,
 * combining marks or variation selectors). The zero-width joiner alone is fine: emoji sequences need it.
 */
export function hasInvisibleChars(value: string): boolean {
  const v = value.trim();
  if (REFUSED_CHAR.test(v.replace(/\u200D/g, ""))) return true;
  return v !== "" && !VISIBLE_CHAR.test(v);
}

/**
 * Message for a text field the API refused as BAD_USER_INPUT: the form's own
 * "too long" message only when the value really is over `max`; otherwise the
 * text holds characters the API refuses, which the length can't explain.
 */
export function textInputErrorKey<K extends MessageKey>(value: string, max: number, tooLongKey: K): K | "form.error.badChars" {
  return textLength(value) > max ? tooLongKey : "form.error.badChars";
}

/**
 * Message for a shop name the API refused as BAD_USER_INPUT (#444): too long, invisible characters, or else a
 * platform / staff word ("客服", "admin"), which is the one reason left.
 */
export function shopNameErrorKey(value: string, max: number): "shop.error.name" | "form.error.badChars" | "shop.error.nameReserved" {
  if (textLength(value) > max) return "shop.error.name";
  return hasInvisibleChars(value) ? "form.error.badChars" : "shop.error.nameReserved";
}
