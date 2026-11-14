// Pure helpers for saving one option row on the dashboard (updateVariant).
import type { MessageKey } from "../i18n/dict";

export interface VariantUpdateInput {
  priceTwd: number;
  stock?: number;
  /** The stock the seller last loaded; the API refuses with STOCK_CHANGED if an order changed it (#277). */
  expectedStock?: number;
  isAvailable?: boolean;
}

/**
 * The updateVariant input for a row. Stock is sent only when the seller
 * changed it, and then always with the stock they last saw, so a save can't
 * silently overwrite bags an order took meanwhile. isAvailable is sent only
 * when toggled (the API reports false for sold-out rows, so it can't be echoed).
 */
export function variantUpdateInput(
  loaded: { stock: number },
  next: { priceTwd: number; stock: number },
  availability?: boolean,
): VariantUpdateInput {
  const input: VariantUpdateInput = { priceTwd: next.priceTwd };
  if (next.stock !== loaded.stock) {
    input.stock = next.stock;
    input.expectedStock = loaded.stock;
  }
  if (availability !== undefined) input.isAvailable = availability;
  return input;
}

/** Message for a failed option save or add, by API error code. */
export function variantSaveErrorKey(code: string): MessageKey {
  if (code === "STOCK_CHANGED") return "cf.error.stockChanged";
  if (code === "CONFLICT") return "cf.error.duplicate";
  return "cf.error.generic";
}
