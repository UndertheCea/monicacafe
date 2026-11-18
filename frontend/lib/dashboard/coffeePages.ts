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
export function appendCoffeePage<C extends { id: string }>(
  list: List<C>,
  page: List<C>,
  deleted: ReadonlySet<string> = new Set(),
): List<C> {
  const seen = new Set(list.nodes.map((c) => c.id));
  // A page fetched before a delete can still carry the deleted row: drop it
  // and take it off the (stale) total as well.
  const gone = page.nodes.filter((c) => deleted.has(c.id)).length;
  return {
    total: Math.max(0, page.total - gone),
    nodes: [...list.nodes, ...page.nodes.filter((c) => !seen.has(c.id) && !deleted.has(c.id))],
  };
}

/**
 * Applies `f` to the coffee list of the CURRENT load state. A no-op unless the
 * state is ready with a shop. Use it as `setLoad((cur) => updateCoffees(cur, f))`
 * so overlapping actions never overwrite each other with a stale snapshot.
 */
export function updateCoffees<C, S extends { coffees: List<C> }, L extends { state: string }>(
  load: L,
  f: (coffees: List<C>) => List<C>,
  lastPage?: number,
): L {
  const cur = load as unknown as { state: string; shop?: S | null; lastPage?: number };
  if (cur.state !== "ready" || !cur.shop) return load;
  return { ...cur, shop: { ...cur.shop, coffees: f(cur.shop.coffees) }, lastPage: lastPage ?? cur.lastPage } as unknown as L;
}

/**
 * Restores the order of `order` (ids) on the current list: ids not in `order`
 * (rows added meanwhile) keep their relative order after the others, and rows
 * missing from the current list are ignored.
 */
export function restoreOrder<C extends { id: string }>(list: List<C>, order: readonly string[]): List<C> {
  const rank = new Map(order.map((id, i) => [id, i]));
  const known = list.nodes.filter((c) => rank.has(c.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return { ...list, nodes: [...known, ...list.nodes.filter((c) => !rank.has(c.id))] };
}

/** A set of ids with one added or removed, as a new Set (for React state). */
export function toggleId(set: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const out = new Set(set);
  if (on) out.add(id);
  else out.delete(id);
  return out;
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
