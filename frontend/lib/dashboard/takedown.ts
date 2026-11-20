// Pure helpers for moderation blocks on the dashboard (#282).
import type { MessageKey } from "../i18n/dict";

/**
 * Message for a seller action refused by moderation: the shop is suspended
 * (SHOP_SUSPENDED, read-only for its owner) or the coffee was taken down by an
 * admin (TAKEN_DOWN: no publish, duplicate or delete until restored). null for
 * any other code, so each form keeps its own messages.
 */
export function moderationBlockKey(code: string): MessageKey | null {
  if (code === "SHOP_SUSPENDED") return "dash.error.shopSuspended";
  if (code === "TAKEN_DOWN") return "dash.error.takenDown";
  return null;
}

/**
 * Whether the dashboard offers "New coffee": not while the shop is suspended,
 * since the API refuses createCoffee then (#431) and the seller would fill in
 * the whole form for nothing.
 */
export function canAddCoffee(shop: { suspended: boolean }): boolean {
  return !shop.suspended;
}
