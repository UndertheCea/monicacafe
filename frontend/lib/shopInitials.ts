// Initials for a shop without a logo (#112): a black-outlined circle with these letters replaces the old ☕.

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
const ALNUM = /[\p{L}\p{N}]/u;

/**
 * - Chinese / Japanese / Korean names: the first character ("晨光烘豆所 Dawn Roastery" → "晨").
 * - Latin names: the first letters of the first two words, uppercased ("dawn roastery" → "DR", "Kaffa" → "K").
 * Leading emoji and punctuation are skipped; a name with no letters or digits gives "".
 */
export function shopInitials(name: string): string {
  const chars = [...name.normalize("NFC")];
  const first = chars.find((c) => ALNUM.test(c));
  if (!first) return "";
  if (CJK.test(first)) return first;
  const letters: string[] = [];
  for (const word of name.trim().split(/[\s\-_/·&+.,|]+/u)) {
    const c = [...word].find((ch) => ALNUM.test(ch));
    if (!c) continue;
    if (CJK.test(c)) break; // "Dawn 晨光" → "D": don't mix scripts
    letters.push(c.toUpperCase());
    if (letters.length === 2) break;
  }
  return letters.join("");
}
