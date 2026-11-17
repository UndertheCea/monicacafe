// Pure helpers for naming why the API refused a text field (#341). Loadable by `node --test`.
import type { MessageKey } from "./i18n/dict";

/** Characters in a trimmed value, counted like the API does (code points, not UTF-16 units). */
export function textLength(value: string): number {
  return [...value.trim()].length;
}

/** Whether the text holds control or invisible formatting characters (e.g. a zero-width space) the API refuses. */
export function hasInvisibleChars(value: string): boolean {
  return /[\p{Cc}\p{Cf}]/u.test(value.trim());
}

/**
 * Message for a text field the API refused as BAD_USER_INPUT: the form's own
 * "too long" message only when the value really is over `max`; otherwise the
 * text holds characters the API refuses, which the length can't explain.
 */
export function textInputErrorKey<K extends MessageKey>(value: string, max: number, tooLongKey: K): K | "form.error.badChars" {
  return textLength(value) > max ? tooLongKey : "form.error.badChars";
}
