// Pure helpers for the cart (#280; API from #21). No runtime imports, so
// `npm test` can load this file directly. Prices are whole NT$ integers.
import type { MessageKey } from "./i18n/dict";

/** Most bags of one option a cart line may hold (backend store.MaxCartQuantity). */
export const MAX_CART_QUANTITY = 20;

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

/** Message for a failed cart write, by API error code and field. */
export function cartErrorKey(code: string, field?: string): MessageKey {
  if (code === "LIMIT_REACHED") return "cart.error.full";
  if (code === "BAD_USER_INPUT" && field === "quantity") return "cart.error.quantity";
  if (code === "BAD_USER_INPUT" || code === "NOT_FOUND") return "cart.error.unavailable";
  return "cart.error.generic";
}
