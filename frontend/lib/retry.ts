/**
 * Retrying a client-side load (#437). A panel keeps a counter in its load effect's deps: bumping it re-runs the
 * load, so "Try again" and a repeated search submit refetch without a page reload.
 */
export function nextLoadKey(key: number): number {
  return key + 1;
}

/**
 * A search submit always refetches: the same query again is a deliberate refresh, so the load key always
 * advances; the query is only the new value to search for.
 */
export function submitSearch(current: { query: string; key: number }, q: string): { query: string; key: number } {
  return { query: q, key: nextLoadKey(current.key) };
}
