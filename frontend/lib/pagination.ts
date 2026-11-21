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

/**
 * True when the list has items but `page` (1-based) is beyond the last page, so
 * an empty page means "you went too far", not "nothing here" (#334).
 */
export function pastLastPage(total: number, page: number, pageSize: number): boolean {
  return total > 0 && page > Math.ceil(total / pageSize);
}

/**
 * True when `page` is beyond the last page, also for an empty list: only page 1
 * exists then, so ?page=2+ of "no results" is a soft 404 to keep out of the
 * index (robots only; the UI keeps pastLastPage, #461).
 */
export function beyondEnd(total: number, page: number, pageSize: number): boolean {
  return page > Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Highest `?page=` the listings ask for (#399). A bigger number would make an
 * offset GraphQL's Int refuses (the error page instead of "past the last page");
 * no list is anywhere near this long.
 */
export const MAX_PAGE = 10_000;

/** A parsed `?page=` value as a page number: 1 for anything not a positive integer, at most MAX_PAGE. */
export function clampPage(n: number): number {
  return Number.isFinite(n) && n > 1 ? Math.min(Math.floor(n), MAX_PAGE) : 1;
}

/** Whether a pager belongs under a list: more than one page, and not past the last (the card links back, #399). */
export function showPager(page: number, pages: number): boolean {
  return pages > 1 && page <= pages;
}
