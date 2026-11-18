// Pure decisions for the cart UI (#372, #374). Kept apart from lib/cart.ts.

/**
 * What the coffee page's cart button is. Without JavaScript the auth state
 * never leaves "loading", so loading shows the sign-in link too (#372); once
 * the session resolves, signed-in visitors get the real "Add to cart" button.
 */
export function addToCartMode(status: "loading" | "anonymous" | "authenticated"): "login" | "add" {
  return status === "authenticated" ? "add" : "login";
}

/** The quantity chosen in a cart line's picker: the unsaved choice, else the saved one. */
export function chosenQuantity(saved: number, draft: number | undefined): number {
  return draft ?? saved;
}

/** Whether "Update" has anything to save (#374): the chosen quantity differs from the saved one. */
export function quantityChanged(saved: number, draft: number | undefined): boolean {
  return draft !== undefined && draft !== saved;
}

/**
 * Where focus goes after a line is removed (#374): the line that followed it,
 * else the one before it, else the cart heading. `ids` are the line ids in
 * the order shown, before the removal.
 */
export function focusTargetAfterRemove(
  ids: string[],
  removedId: string,
): { kind: "line"; id: string } | { kind: "heading" } {
  const i = ids.indexOf(removedId);
  const rest = ids.filter((id) => id !== removedId);
  if (rest.length === 0) return { kind: "heading" };
  return { kind: "line", id: rest[Math.min(i < 0 ? 0 : i, rest.length - 1)] };
}
