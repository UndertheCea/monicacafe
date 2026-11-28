// Links to a shop's pin in Google Maps (owner on #293: exact pins are fine, and buyers get a button that opens
// Google Maps to navigate there). The URL is built by the platform from the stored coordinates, never taken
// from the seller, so sellers still can't link out. Pure: `node --test` loads this directly.

export interface MaybeCoords {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

const valid = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Google Maps' documented cross-platform search URL for a point: it opens the app on phones and the site
 * elsewhere, where "Directions" is one tap away. null when the shop has no usable pin.
 */
export function googleMapsUrl({ lat, lng }: MaybeCoords): string | null {
  if (!valid(lat, lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng as number}`;
}
