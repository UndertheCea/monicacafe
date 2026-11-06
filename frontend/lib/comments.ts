// Comment paging helpers (pure, no imports, so `npm test` can load them).

/** Comments per page: the first page is server-rendered, "load more" fetches the next. */
export const COMMENTS_PAGE = 20;

/**
 * Appends a fetched page to the comments already shown, skipping ids that are
 * already there. Pages are offset-based, so a comment posted between two
 * fetches shifts the next page by one and would otherwise appear twice.
 */
export function appendComments<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((c) => c.id));
  return [...shown, ...page.filter((c) => !seen.has(c.id))];
}

/**
 * Whether a "load more" button makes sense: fewer shown than the total, and
 * the last page wasn't short (a short page means the end, even if the count
 * was stale).
 */
export function hasMoreComments(shown: number, total: number, lastPageSize: number): boolean {
  return shown < total && lastPageSize >= COMMENTS_PAGE;
}
