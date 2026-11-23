// Pure helpers for saving one option row on the dashboard (updateVariant).
import type { MessageKey } from "../i18n/dict";
import { parseWhole } from "./validate.ts";

export interface VariantUpdateInput {
  priceTwd?: number;
  stock?: number;
  /** The stock the seller last loaded; the API refuses with STOCK_CHANGED if an order changed it (#277). */
  expectedStock?: number;
  isAvailable?: boolean;
}

/**
 * The updateVariant input for a row, or null when nothing changed. The price is
 * sent only when it differs from the stored one, so an option stored at NT$0
 * before #358 can still be switched off or restocked (#481). Stock is sent only
 * when the seller changed it, and then always with the stock they last saw, so
 * a save can't silently overwrite bags an order took meanwhile. isAvailable
 * (the on-sale switch) is sent only when toggled.
 */
export function variantUpdateInput(
  loaded: { priceTwd?: number; stock: number },
  next: { priceTwd: number; stock: number },
  availability?: boolean,
): VariantUpdateInput | null {
  const input: VariantUpdateInput = {};
  if (next.priceTwd !== loaded.priceTwd) input.priceTwd = next.priceTwd;
  if (next.stock !== loaded.stock) {
    input.stock = next.stock;
    input.expectedStock = loaded.stock;
  }
  if (availability !== undefined) input.isAvailable = availability;
  return Object.keys(input).length > 0 ? input : null;
}

/**
 * Whether a typed field still holds the stored value: it parses to it, or its
 * text is exactly it even when that no longer passes today's limits (an NT$0
 * option stored before #358, #434).
 */
export function sameAsStored(parsed: number | null, text: string | undefined, value: number): boolean {
  return parsed === value ||
    (text !== undefined && (text.trim() === String(value) || parseWhole(text, 0, Number.MAX_SAFE_INTEGER) === value));
}

/**
 * The price a row saves with: the stored one when the box still holds it (even
 * NT$0, #481), otherwise the parsed value (null = show the price error).
 */
export function rowPrice(stored: number, parsed: number | null, text: string): number | null {
  return sameAsStored(parsed, text, stored) ? stored : parsed;
}

/**
 * Whether a row differs from what is stored. The checkbox is compared with the
 * stored switch (`onSale`), never with `isAvailable`, which is also false when
 * the stock is 0, so a sold-out row saved "off sale" isn't left dirty (#318).
 * A field whose typed text is exactly the stored value is unchanged even when
 * it no longer parses within today's limits: an untouched NT$0 option stored
 * before #358 must not open as "unsaved changes" (#434).
 */
export function variantRowDirty(
  stored: { priceTwd: number; stock: number; onSale: boolean },
  row: { priceTwd: number | null; stock: number | null; onSale: boolean; priceText?: string; stockText?: string },
): boolean {
  return !sameAsStored(row.priceTwd, row.priceText, stored.priceTwd) ||
    !sameAsStored(row.stock, row.stockText, stored.stock) ||
    row.onSale !== stored.onSale;
}

/** Message for a failed option save or add, by API error code. */
export function variantSaveErrorKey(code: string): MessageKey {
  if (code === "STOCK_CHANGED") return "cf.error.stockChanged";
  if (code === "CONFLICT") return "cf.error.duplicate";
  return "cf.error.generic";
}
