// "Load more" for offset-paged lists whose rows can be removed meanwhile (#338).
// Pure, no imports, so `npm test` can load it.
//
// The lists on /account (saved coffees, followed shops, my comments) and the
// dashboard's recent comments page by offset. A row removed while the next page
// is in flight shifts the server's list left by one: the page fetched from the
// old offset skips an item, and writing the page into the list captured before
// the fetch brings the removed row back. So the fetch offset subtracts the rows
// removed since the load started, a fetch that a removal overtook is retried,
// and the page is merged into the list as it is *now*, minus removed ids.

/** Times a load is retried when a removal finishes while its page is in flight. */
export const LOAD_MORE_RETRIES = 2;

/**
 * Offset to fetch the next page from: the rows shown when the load started,
 * less the rows removed since then (every removable row is a shown row).
 */
export function loadMoreOffset(shownAtStart: number, removalsAtStart: number, removalsNow: number): number {
  return Math.max(0, shownAtStart - Math.max(0, removalsNow - removalsAtStart));
}

/**
 * Whether to fetch again: a removal finished while this page was in flight, so
 * the page may have been read before the server's list shifted. Gives up after
 * `LOAD_MORE_RETRIES` retries (the merge below still keeps the list correct,
 * it may only miss one row until the next load).
 */
export function loadMoreStale(removalsBefore: number, removalsAfter: number, attempt: number): boolean {
  return removalsAfter !== removalsBefore && attempt < LOAD_MORE_RETRIES;
}

/**
 * The current list with a fetched page appended: ids already shown or removed
 * meanwhile are skipped, and the total is the page's (the server's newest)
 * less any removed row the page still contained.
 */
export function mergeLoaded<T extends { id: string }>(
  current: { total: number; nodes: T[] },
  page: { total: number; nodes: T[] },
  removed: ReadonlySet<string>,
): { total: number; nodes: T[] } {
  const seen = new Set(current.nodes.map((n) => n.id));
  const stale = page.nodes.filter((n) => removed.has(n.id)).length;
  const nodes = [...current.nodes, ...page.nodes.filter((n) => !seen.has(n.id) && !removed.has(n.id))];
  return { total: Math.max(nodes.length, page.total - stale), nodes };
}
