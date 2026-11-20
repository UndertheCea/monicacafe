// Pure decisions for the cart UI (#372, #374). Kept apart from lib/cart.ts.

/**
 * What the coffee page's cart button is. Without JavaScript the auth state
 * never leaves "loading", so loading shows the sign-in link too (#372); once
 * the session resolves, signed-in visitors get the real "Add to cart" button.
 */
export function addToCartMode(status: "loading" | "anonymous" | "authenticated"): "login" | "add" {
  return status === "authenticated" ? "add" : "login";
}

/**
 * The draft that still counts: one the picker offers. A cart reload can shrink
 * a line's choices (stock fell) while an unsaved pick is kept, and a `<select>`
 * whose value has no option shows some other number (#435).
 */
function liveDraft(draft: number | undefined, choices?: readonly number[]): number | undefined {
  if (draft === undefined || (choices && !choices.includes(draft))) return undefined;
  return draft;
}

/** The quantity chosen in a cart line's picker: the unsaved choice if still offered, else the saved one. */
export function chosenQuantity(saved: number, draft: number | undefined, choices?: readonly number[]): number {
  return liveDraft(draft, choices) ?? saved;
}

/** Whether "Update" has anything to save (#374): the chosen quantity differs from the saved one. */
export function quantityChanged(saved: number, draft: number | undefined, choices?: readonly number[]): boolean {
  const d = liveDraft(draft, choices);
  return d !== undefined && d !== saved;
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
