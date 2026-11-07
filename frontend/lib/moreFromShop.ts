// "More from this shop" and "You may also like" on the coffee page. No imports, so `npm test` can load it.

/** How many other coffees the coffee page shows. */
export const MORE_FROM_SHOP = 4;

/**
 * The shop's other coffees, in the order the API gave them, without the one
 * being viewed (or any repeat), at most `max`.
 */
export function moreFromShop<T extends { id: string }>(nodes: T[], currentId: string, max = MORE_FROM_SHOP): T[] {
  const seen = new Set([currentId]);
  const out: T[] = [];
  for (const n of nodes) {
    if (out.length >= max) break;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

/** How many similar coffees from other shops the coffee page shows. */
export const SIMILAR_COFFEES = 4;

/**
 * "You may also like": the API's similar coffees, in its order, without the
 * coffee being viewed or any already shown on the page (e.g. in "more from
 * this shop"), at most `max`.
 */
export function alsoLike<T extends { id: string }>(similar: T[], shown: { id: string }[], currentId: string, max = SIMILAR_COFFEES): T[] {
  return moreFromShop(similar.filter((c) => !shown.some((s) => s.id === c.id)), currentId, max);
}
