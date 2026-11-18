// What a CONFLICT from createShop means (#392).

/**
 * "hasShop" when the account already owns a shop (e.g. created in another tab: the form should load it),
 * "slugTaken" when the URL name belongs to another shop, null for anything else (not a conflict, or a
 * conflict this form doesn't know, which reads as "couldn't save").
 */
export function createShopConflict(code: string, field?: string): "hasShop" | "slugTaken" | null {
  if (code !== "CONFLICT") return null;
  if (field === "owner") return "hasShop";
  if (field === "slug") return "slugTaken";
  return null;
}
