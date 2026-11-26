// Pure helpers for deleting a draft coffee from the dashboard.
import type { MessageKey } from "../i18n/dict";
import { moderationBlockKey } from "./takedown.ts";
import { dashWriteError, type DashWriteError } from "./writeError.ts";

/** Message for a failed deleteCoffee, by API error code and field. */
export function deleteCoffeeErrorKey(code: string, field?: string): MessageKey {
  const blocked = moderationBlockKey(code);
  if (blocked) return blocked;
  // An open report waits for an admin: deleting would erase it (#282).
  if (code === "CONFLICT" && field === "reports") return "dash.error.deleteReported";
  if (code === "CONFLICT") return "dash.error.deletePublished";
  if (code === "NOT_FOUND" || code === "FORBIDDEN") return "cf.notYours";
  return "dash.error.generic";
}

/** Message for a failed deleteCoffee, with the wait when the seller deleted too often (#532). */
export function deleteCoffeeError(code: string, field?: string, retryAfter?: number): DashWriteError {
  return dashWriteError(code, retryAfter) ?? { key: deleteCoffeeErrorKey(code, field) };
}

/** The shop's coffee list with one coffee removed, so the list updates without a refetch. */
export function withoutCoffee<C extends { id: string }>(
  coffees: { total: number; nodes: C[] },
  id: string,
): { total: number; nodes: C[] } {
  const nodes = coffees.nodes.filter((c) => c.id !== id);
  return { total: Math.max(0, coffees.total - (coffees.nodes.length - nodes.length)), nodes };
}
