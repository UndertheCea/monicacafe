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

const PAIR = String.raw`(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)`;

function point(lat: string, lng: string): { lat: number; lng: number } | null {
  const a = Number(lat);
  const b = Number(lng);
  if (!valid(a, b)) return null;
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(b * 1e6) / 1e6 };
}

/**
 * Coordinates from a pasted Google Maps link or a typed "lat, lng" pair (#293, #566), so a seller can set the pin
 * from the place they already have open in Google Maps. Only the point is kept, never the URL. A place page's
 * `!3d…!4d…` (the place itself) wins over `@lat,lng` (where the view was centred). Short links
 * (maps.app.goo.gl, goo.gl/maps) can't be expanded in the browser: "short". Anything else without a point: null.
 */
export function parseMapsLink(input: string): { lat: number; lng: number } | "short" | null {
  let s = input.normalize("NFKC").trim();
  if (!s) return null;
  if (/^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\b/i.test(s)) return "short";
  try {
    s = decodeURIComponent(s);
  } catch {
    // A stray % is fine: read the text as it is.
  }
  const bare = new RegExp(`^${PAIR}$`).exec(s);
  if (bare) return point(bare[1], bare[2]);
  if (!/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*google\.[a-z.]+\/(?:maps|\?)|^(?:https?:\/\/)?maps\.google\./i.test(s)) return null;
  const place = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s);
  if (place) return point(place[1], place[2]);
  const param = new RegExp(`[?&](?:q|query|ll|center|destination|daddr)=(?:loc:)?${PAIR}(?:&|$|#)`).exec(s);
  if (param) return point(param[1], param[2]);
  const at = new RegExp(`/@${PAIR}`).exec(s);
  if (at) return point(at[1], at[2]);
  return null;
}
