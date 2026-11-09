// Paging the seller's coffee list on the dashboard (pure, no imports, so
// `npm test` can load it).

/** Coffees per dashboard page; "load more" fetches the next. The API caps a page at 100. */
export const DASH_COFFEES_PAGE = 50;

type List<C> = { total: number; nodes: C[] };

/**
 * Appends a fetched page to the coffees already listed, skipping ids already
 * there (pages are offset-based, so a change between fetches can shift rows),
 * and takes the newer total.
 */
export function appendCoffeePage<C extends { id: string }>(list: List<C>, page: List<C>): List<C> {
  const seen = new Set(list.nodes.map((c) => c.id));
  return { total: page.total, nodes: [...list.nodes, ...page.nodes.filter((c) => !seen.has(c.id))] };
}

/** Whether "load more" makes sense: fewer listed than the total and the last page was full. */
export function hasMoreCoffees(listed: number, total: number, lastPageSize: number): boolean {
  return listed < total && lastPageSize >= DASH_COFFEES_PAGE;
}

/** The list with one coffee's publish state changed, so loaded-more rows survive a toggle. */
export function withPublished<C extends { id: string; isPublished: boolean }>(
  list: List<C>,
  id: string,
  isPublished: boolean,
): List<C> {
  return { ...list, nodes: list.nodes.map((c) => (c.id === id ? { ...c, isPublished } : c)) };
}

/**
 * The list with the item at `index` moved `delta` places (−1 = up, +1 = down),
 * as a new array. A move past either end, or from an index outside the list,
 * returns the list unchanged (same array), so callers can skip the request.
 */
export function moveItem<T>(list: readonly T[], index: number, delta: number): readonly T[] {
  const to = index + delta;
  if (!Number.isInteger(index) || !Number.isInteger(delta) || delta === 0) return list;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item);
  return out;
}

/**
 * Whether the seller can reorder from the dashboard: reorderShopCoffees needs
 * every coffee's id, so all of them must be loaded, and one coffee has no order.
 */
export function canReorder(listed: number, total: number): boolean {
  return total > 1 && listed >= total;
}
