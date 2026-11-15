// The signed-in buyer's cart as this tab last saw it, shared by the header's
// cart link, the coffee page's picker and /cart (#311). Whoever reads or
// changes the cart calls setCartSnapshot(); everyone subscribed re-renders.
// Not persisted and per tab: the server stays the source of truth.
import type { CartData } from "./cart";

let snapshot: CartData | null = null;
const listeners = new Set<() => void>();

export function setCartSnapshot(cart: CartData | null): void {
  snapshot = cart;
  for (const l of listeners) l();
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getCartSnapshot = (): CartData | null => snapshot;
export const getServerCartSnapshot = (): CartData | null => null;
