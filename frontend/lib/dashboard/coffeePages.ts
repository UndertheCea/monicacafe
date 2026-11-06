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
