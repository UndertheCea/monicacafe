// Saved-coffee helpers (pure, no imports, so `npm test` can load them).

/** What the save button shows: whether the viewer saved the coffee, and how many people did. */
export interface SaveState {
  saved: boolean;
  count: number;
}

/**
 * The state after the viewer toggles to `saved`, shown before the API answers
 * (rolled back on error). Toggling to the current state changes nothing, and
 * the count never drops below zero.
 */
export function toggleSave(state: SaveState, saved: boolean): SaveState {
  if (state.saved === saved) return state;
  return { saved, count: Math.max(0, state.count + (saved ? 1 : -1)) };
}

/**
 * Takes the API's answer over the optimistic guess. A null result (unsave of a
 * coffee the viewer can no longer see) keeps the guess.
 */
export function settleSave(guess: SaveState, result: { isSaved: boolean; saveCount: number } | null): SaveState {
  return result ? { saved: result.isSaved, count: result.saveCount } : guess;
}

/** Saved coffees per page on /account. */
export const SAVED_PAGE = 12;

/**
 * Appends a fetched page of saved coffees, skipping ids already shown (offset
 * pages shift when a coffee is saved or removed between fetches).
 */
export function appendSaved<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((c) => c.id));
  return [...shown, ...page.filter((c) => !seen.has(c.id))];
}

/** The list after removing one coffee: the row goes and the total drops (only if it was there). */
export function withoutSaved<T extends { id: string }>(list: { total: number; nodes: T[] }, id: string) {
  const nodes = list.nodes.filter((c) => c.id !== id);
  return { total: Math.max(0, list.total - (list.nodes.length - nodes.length)), nodes };
}

/**
 * Whether "load more" makes sense: fewer shown than the total, and the last
 * page was full (a short page means the end, even if the total was stale).
 */
export function hasMoreSaved(shown: number, total: number, lastPageSize: number, pageSize = SAVED_PAGE): boolean {
  return shown < total && lastPageSize >= pageSize;
}
