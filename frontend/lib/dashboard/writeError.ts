// One message for the refusals every seller write can meet (#339).
import type { MessageKey } from "../i18n/dict";
import { rateLimitMessage } from "../errors.ts";
import { moderationBlockKey } from "./takedown.ts";

export type DashWriteError = { key: MessageKey; vars?: Record<string, number> };

/**
 * Message for a seller write refused because the shop is suspended
 * (SHOP_SUSPENDED), the coffee was taken down (TAKEN_DOWN) or the seller
 * saved too often (RATE_LIMITED, with the wait). null for any other code, so
 * each form keeps its own message.
 */
export function dashWriteError(code: string, retryAfter?: number): DashWriteError | null {
  const blocked = moderationBlockKey(code);
  if (blocked) return { key: blocked };
  if (code === "RATE_LIMITED") return rateLimitMessage(retryAfter);
  return null;
}
