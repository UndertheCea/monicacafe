// Pure helpers for the seller's draft preview (/dashboard/coffees/[id]/preview).
import type { MessageKey } from "../i18n/dict";

export interface PreviewViewer {
  role: string;
  shop: { id: string } | null;
}

/**
 * Whether the signed-in viewer may manage (and so preview) a coffee from the
 * shop with id `coffeeShopId`. Published coffees load for anyone, so the
 * dashboard checks ownership itself; the API re-checks on every mutation.
 */
export function canManageCoffee(coffeeShopId: string, viewer: PreviewViewer | null): boolean {
  if (!viewer) return false;
  if (viewer.role === "ADMIN") return true;
  return viewer.shop !== null && viewer.shop.id === coffeeShopId;
}

/** The banner above a preview: drafts are clearly marked as not public yet. */
export function previewBannerKey(isPublished: boolean): MessageKey {
  return isPublished ? "preview.publishedBanner" : "preview.draftBanner";
}
