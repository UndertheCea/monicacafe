// Pure helpers for the cart (#280; API from #21). No runtime imports, so
// `npm test` can load this file directly. Prices are whole NT$ integers.
import type { MessageKey } from "./i18n/dict";

/** Most bags of one option a cart line may hold (backend store.MaxCartQuantity). */
export const MAX_CART_QUANTITY = 20;

/** Cheapest price (NT$) the API lets into a cart (mirrors backend graph.MinCartPriceTWD, like MAX_CART_QUANTITY above). */
export const MIN_CART_PRICE_TWD = 1;

export interface CartLine {
  id: string;
  quantity: number;
  priceTwd: number;
  addedPriceTwd: number;
  priceChanged: boolean;
  available: boolean;
  lineTotalTwd: number;
  variant: { id: string; grind: string; weightG: number; stock: number; isAvailable: boolean };
  coffee: { id: string; name: string; shop: { slug: string; name: string } } | null;
}

export interface CartData {
  items: CartLine[];
  subtotalTwd: number;
  itemCount: number;
}

export interface ShopGroup {
  /** null for lines whose coffee is no longer on the site. */
  shop: { slug: string; name: string } | null;
  lines: CartLine[];
  /** Sum of this shop's lines that can be bought now. */
  subtotalTwd: number;
}

/**
 * Lines grouped by shop, in the order each shop first appears (the API
 * returns oldest line first). Lines whose coffee is gone come last in one
 * group with shop null.
 */
export function groupByShop(items: CartLine[]): ShopGroup[] {
  const groups = new Map<string, ShopGroup>();
  const gone: ShopGroup = { shop: null, lines: [], subtotalTwd: 0 };
  for (const line of items) {
    let g = gone;
    if (line.coffee) {
      const key = line.coffee.shop.slug;
      g = groups.get(key) ?? { shop: line.coffee.shop, lines: [], subtotalTwd: 0 };
      groups.set(key, g);
    }
    g.lines.push(line);
    if (line.available) g.subtotalTwd += line.lineTotalTwd;
  }
  const out = [...groups.values()];
  if (gone.lines.length) out.push(gone);
  return out;
}

/**
 * Quantities to offer for a line or an "add" picker: 1 up to the most the
 * line may hold (stock, at most 20), minus what's already in the cart. A
 * line's current quantity is always offered, even above today's stock, so
 * the picker never shows a value it doesn't list.
 */
export function quantityChoices(stock: number, inCart = 0, current?: number): number[] {
  const most = Math.min(MAX_CART_QUANTITY, Math.max(0, stock)) - inCart;
  const top = Math.max(most, current ?? 0);
  return Array.from({ length: Math.max(0, top) }, (_, i) => i + 1);
}

/** Whether an option can be added to a cart: on sale, in stock and priced at least NT$1 (what the API accepts). */
export function canAddToCart(v: { isAvailable: boolean; stock: number; priceTwd: number }): boolean {
  return v.isAvailable && v.stock > 0 && v.priceTwd >= MIN_CART_PRICE_TWD;
}

/**
 * Quantities to offer for a cart line. The API refuses every increase on a
 * line that can't be bought now, so such a line offers only 1..quantity
 * (lowering); a buyable line offers up to its stock.
 */
export function lineQuantityChoices(line: Pick<CartLine, "available" | "quantity" | "variant">): number[] {
  return quantityChoices(line.available ? line.variant.stock : 0, 0, line.quantity);
}

/** Message for a failed cart write, by API error code and field. */
export function cartErrorKey(code: string, field?: string): MessageKey {
  if (code === "OWN_SHOP") return "cart.error.ownShop";
  if (code === "LIMIT_REACHED") return "cart.error.full";
  if (code === "BAD_USER_INPUT" && field === "quantity") return "cart.error.quantity";
  if (code === "BAD_USER_INPUT" || code === "NOT_FOUND") return "cart.error.unavailable";
  return "cart.error.generic";
}

/**
 * Whether the page's cart is probably stale after a refused write: a line
 * that changed or vanished (BAD_USER_INPUT, NOT_FOUND) means reload it.
 * Rate limits, outages and the like say nothing about the cart.
 */
export function shouldReloadCart(code: string): boolean {
  return code === "BAD_USER_INPUT" || code === "NOT_FOUND";
}

export type CartProblem = { key: MessageKey; vars?: Record<string, number> };

/**
 * The message for a failed cart write. Too many bags with a known count of
 * bags left reads "Only N left" (or "sold out" for 0); everything else falls
 * back to cartErrorKey.
 */
export function cartProblem(code: string, field?: string, available?: number): CartProblem {
  if (code === "BAD_USER_INPUT" && field === "quantity" && available !== undefined) {
    return available === 0 ? { key: "cart.error.soldOut" } : { key: "cart.error.onlyLeft", vars: { n: available } };
  }
  return { key: cartErrorKey(code, field) };
}

/**
 * A problem whose line is no longer in the cart (it was removed elsewhere, so
 * the reload dropped it) has no row to show under; the page shows it above the
 * lines instead. Returns that problem, or null when its line is still listed.
 */
export function orphanProblem(
  problem: { line: string; p: CartProblem } | null,
  lines: Pick<CartLine, "id">[],
): CartProblem | null {
  if (!problem || lines.some((l) => l.id === problem.line)) return null;
  return problem.p;
}

/** Bags of one option a cart holds. */
export function inCartFor(items: Pick<CartLine, "quantity" | "variant">[], variantId: string): number {
  return items.reduce((sum, l) => (l.variant.id === variantId ? sum + l.quantity : sum), 0);
}

/**
 * Bags of an option the buyer can still add: stock (at most 20) minus what
 * the cart holds, lowered to `known` when the server said how many are left
 * (its stock is fresher than the page's, which may be a minute old).
 */
export function bagsLeft(stock: number, inCart: number, known?: number): number {
  const left = Math.max(0, Math.min(MAX_CART_QUANTITY, Math.max(0, stock)) - inCart);
  return known === undefined ? left : Math.min(left, Math.max(0, known));
}

/** The singular or plural message key for the bags in a cart (1 is singular), for "cart.itemCount" and "nav.cartCount". */
export function bagCountKey(base: "cart.itemCount" | "nav.cartCount", n: number): MessageKey {
  const one = n === 1;
  if (base === "cart.itemCount") return one ? "cart.itemCount.one" : "cart.itemCount.other";
  return one ? "nav.cartCount.one" : "nav.cartCount.other";
}

/**
 * What a line's controls call it for screen readers: the coffee's name, or
 * "grind · N g" when the coffee is no longer on the site. `grind` is the
 * already translated grind label.
 */
export function cartLineName(line: Pick<CartLine, "coffee" | "variant">, grind: string): string {
  return line.coffee ? line.coffee.name : `${grind} · ${line.variant.weightG} g`;
}

/** "N" for the header's cart link: 99+ beyond two digits; "" for an empty cart. */
export function cartBadgeText(itemCount: number): string {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return "";
  return itemCount > 99 ? "99+" : String(itemCount);
}

/**
 * The login link for a signed-out visitor on a coffee page. `?next=` carries
 * the page plus the chosen option and quantity, so they are back after the
 * round trip (see parseCartChoice).
 */
export function cartLoginHref(pathname: string, variantId: string, quantity: number): string {
  const next = `${pathname}?option=${encodeURIComponent(variantId)}&qty=${quantity}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * The option and quantity a coffee page was opened with (`?option=&qty=`).
 * The option must be one of `variantIds`; the quantity a whole number from 1
 * to 20. Anything else is ignored, so a made-up link changes nothing.
 */
export function parseCartChoice(
  search: string,
  variantIds: string[],
): { variantId?: string; quantity?: number } {
  const params = new URLSearchParams(search);
  const out: { variantId?: string; quantity?: number } = {};
  const option = params.get("option");
  if (option && variantIds.includes(option)) out.variantId = option;
  const qty = params.get("qty");
  if (qty && /^\d{1,2}$/.test(qty)) {
    const n = Number(qty);
    if (n >= 1 && n <= MAX_CART_QUANTITY) out.quantity = n;
  }
  return out;
}
