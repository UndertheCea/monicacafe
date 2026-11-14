// Why a coffee is in the keyword-search results (#274). The API matches each
// search word, or one of its synonyms (`searchTerms`, #269), as a substring of
// many fields; when the match isn't already visible on the card (the seller
// wrote 耶加雪菲 and the buyer typed Yirgacheffe, or it is in the description),
// the card shows one line with the matched text. Pure, so `npm test` covers it.

import type { Locale } from "./i18n/dict";

export type MatchField =
  | "name"
  | "notes"
  | "region"
  | "producer"
  | "variety"
  | "origin"
  | "process"
  | "shop"
  | "description";

/** One searchable text and whether the card already shows it. */
export interface SearchField {
  field: MatchField;
  text: string;
  visible: boolean;
}

export interface SearchMatch {
  field: MatchField;
  /** The field's text around the match: before + match + after. */
  before: string;
  match: string;
  after: string;
}

/** Characters of context kept on each side of the match. */
export const SNIPPET_RADIUS = 24;

/**
 * The first search word that needs explaining, as a match in the first field
 * (in `fields` order) containing any of its alternatives (the longest one found
 * in that field is marked). A word needs no
 * explanation when the card visibly contains it as typed. Null when every word
 * is visible or no field (of those passed) contains it.
 */
export function findSearchMatch(fields: SearchField[], terms: string[][]): SearchMatch | null {
  for (const alternatives of terms) {
    const typed = alternatives[0];
    if (!typed) continue;
    if (fields.some((f) => f.visible && indexOfFold(f.text, typed) >= 0)) continue;
    for (const f of fields) {
      // The longest alternative found marks the most text (茉莉花, not 茉莉).
      let best: { at: number; len: number } | null = null;
      for (const alt of alternatives) {
        const at = indexOfFold(f.text, alt);
        if (at >= 0 && (!best || alt.length > best.len)) best = { at, len: alt.length };
      }
      if (best) return snippet(f.field, f.text, best.at, best.at + best.len);
    }
  }
  return null;
}

/** Case-insensitive indexOf that keeps positions in the original string. */
export function indexOfFold(text: string, needle: string): number {
  if (!needle) return -1;
  const lower = text.toLowerCase();
  // toLowerCase can change length for a few characters (e.g. İ); fall back to
  // an exact search then, so slicing never cuts the wrong span.
  if (lower.length !== text.length) return text.indexOf(needle);
  return lower.indexOf(needle.toLowerCase());
}

/** Cuts `text` to the match plus SNIPPET_RADIUS characters each side, with ellipses. */
export function snippet(field: MatchField, text: string, start: number, end: number): SearchMatch {
  const from = Math.max(0, start - SNIPPET_RADIUS);
  const to = Math.min(text.length, end + SNIPPET_RADIUS);
  const flat = (s: string) => s.replace(/\s+/g, " ");
  return {
    field,
    before: (from > 0 ? "…" : "") + flat(text.slice(from, start)).trimStart(),
    match: text.slice(start, end),
    after: flat(text.slice(end, to)).trimEnd() + (to < text.length ? "…" : ""),
  };
}

/** The fields of a coffee card, in the order a match is reported. */
export function cardSearchFields(
  c: {
    name: string;
    flavorNotes: string[];
    region: string;
    producer: string;
    variety: { name: string } | null;
    originCountry: { nameEn: string; nameZh: string };
    processingMethod: { nameEn: string; nameZh: string };
    shop: { name: string };
    description?: string;
  },
  locale: Locale,
  visibleNotes = 4,
): SearchField[] {
  const shown = (zh: string, en: string) => (locale === "en" ? [en, zh] : [zh, en]);
  const [originShown, originOther] = shown(c.originCountry.nameZh, c.originCountry.nameEn);
  const [processShown, processOther] = shown(c.processingMethod.nameZh, c.processingMethod.nameEn);
  return [
    { field: "name", text: c.name, visible: true },
    ...c.flavorNotes.map((n, i) => ({ field: "notes" as const, text: n, visible: i < visibleNotes })),
    { field: "region", text: c.region, visible: true },
    { field: "producer", text: c.producer, visible: true },
    { field: "variety", text: c.variety?.name ?? "", visible: true },
    { field: "origin", text: originShown, visible: true },
    { field: "origin", text: originOther, visible: false },
    { field: "process", text: processShown, visible: true },
    { field: "process", text: processOther, visible: false },
    { field: "shop", text: c.shop.name, visible: true },
    { field: "description", text: c.description ?? "", visible: false },
  ];
}
