// Brand name, written one way everywhere (#110). The wordmark shows it lowercase and italic;
// titles, metadata and screen readers get "Moni Cafe".

export const BRAND_NAME = "Moni Cafe";

export const WORDMARK = {
  /** Accessible name of the wordmark link. */
  label: BRAND_NAME,
  /** The big word. */
  main: "moni",
  /** The small word under its right edge. */
  sub: "cafe",
} as const;

/**
 * The browser-tab title for a page: "Coffee name | Moni Cafe", or the brand alone on the home page.
 * No tagline anywhere (owner, #159): people should know the brand is called Moni Cafe.
 */
export function pageTitle(title?: string): string {
  const trimmed = title?.trim();
  return trimmed ? `${trimmed} | ${BRAND_NAME}` : BRAND_NAME;
}
