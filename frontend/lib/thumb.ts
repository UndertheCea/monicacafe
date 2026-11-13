// Pure helpers for image thumbnails (#235). No imports: `node --test` loads this directly.
// The browser uploads a 640 px WebP beside each original; its key is derived from
// the original's (backend/internal/storage ThumbKey), and only the original's URL
// is ever saved.

/** Width, in pixels, of the thumbnail stored beside every uploaded photo. */
export const THUMB_WIDTH = 640;
/** Quality of the thumbnail's WebP encoding. */
export const THUMB_QUALITY = 0.8;
/** Largest thumbnail the API accepts (backend storage.MaxThumbBytes). */
export const MAX_THUMB_BYTES = 512 * 1024;

/**
 * Pixel size of the thumbnail of a width x height image: THUMB_WIDTH wide,
 * keeping the aspect ratio, and never larger than the image itself.
 */
export function thumbSize(width: number, height: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width, height };
  if (width <= THUMB_WIDTH) return { width, height };
  return { width: THUMB_WIDTH, height: Math.max(1, Math.round((height * THUMB_WIDTH) / width)) };
}

// The shape backend/internal/storage creates: <shops|coffees>/<uuid>/<kind>-<24 hex>.<ext>
const ORIGINAL = /^(https?:\/\/[^?#]*\/(?:shops|coffees)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z]+-[0-9a-f]{24})\.(?:jpg|png|webp)$/;

/**
 * URL of the thumbnail stored next to an uploaded original
 * ("…/photo-<hex>.jpg" becomes "…/photo-<hex>.thumb.webp"), or null for any
 * other URL (a thumbnail itself, another host's image, an old-style key).
 * Photos uploaded before #235 have no thumbnail: callers fall back to the original on a 404.
 */
export function thumbUrl(original: string | null | undefined): string | null {
  const m = original ? ORIGINAL.exec(original) : null;
  return m ? `${m[1]}.thumb.webp` : null;
}
