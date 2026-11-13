// Which extra pager links to show (pure, so `npm test` can check it).

/** Past this many pages the pager adds "first" / "last" links. */
export const PAGER_SHORTCUT_PAGES = 3;

/**
 * The "first" / "last" shortcuts for a pager. Only with more than 3 pages, and
 * only when previous / next doesn't already reach that page (so page 2 has no
 * "first": "previous" is page 1).
 */
export function pagerShortcuts(page: number, pages: number): { first: number | null; last: number | null } {
  if (pages <= PAGER_SHORTCUT_PAGES) return { first: null, last: null };
  return { first: page > 2 ? 1 : null, last: page < pages - 1 ? pages : null };
}
