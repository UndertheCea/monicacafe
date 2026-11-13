// Pure helpers for image uploads. No imports: `node --test` loads this directly.
// The API re-checks type and size (backend/internal/storage).

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_COFFEE_IMAGES = 8;
/** Photos are scaled so their longer side is at most this many pixels (#212). */
export const MAX_IMAGE_SIDE = 2000;
/**
 * Largest file a seller may choose. Above MAX_IMAGE_BYTES it must shrink below
 * that limit before upload; this bound only stops the browser decoding
 * something enormous.
 */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Quality for re-encoded JPEG / WebP photos. */
export const RESIZE_QUALITY = 0.85;

/** Message key for a failed createImageUpload (RATE_LIMITED is handled by the caller with its wait time). */
export function uploadSignErrorKey(code: string): "img.error.quota" | "img.error.unavailable" | "img.error.upload" {
  if (code === "UPLOAD_QUOTA") return "img.error.quota";
  if (code === "BAD_USER_INPUT") return "img.error.unavailable";
  return "img.error.upload";
}

export type ImageProblem = "type" | "size";

const allowedType = (type: string) => (IMAGE_TYPES as readonly string[]).includes(type.toLowerCase());

/**
 * Problem with a file, or null when it can be uploaded as it is. `maxBytes`
 * is MAX_IMAGE_BYTES (what the API accepts) unless checking a file the seller
 * just chose, which may be larger as long as it shrinks (MAX_SOURCE_BYTES).
 */
export function imageFileProblem(file: { type: string; size: number }, maxBytes = MAX_IMAGE_BYTES): ImageProblem | null {
  if (!allowedType(file.type)) return "type";
  if (file.size <= 0 || file.size > maxBytes) return "size";
  return null;
}

/**
 * Pixel size to draw an image at so its longer side is at most `max`, keeping
 * the aspect ratio; `scaled` is false when it already fits.
 */
export function scaledSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number; scaled: boolean } {
  const long = Math.max(width, height);
  if (!(width > 0 && height > 0) || long <= max) return { width, height, scaled: false };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

/** Whether a decoded image should be re-encoded: too many pixels, or too many bytes to upload as it is. */
export function needsShrinking(file: { size: number }, width: number, height: number): boolean {
  return scaledSize(width, height).scaled || file.size > MAX_IMAGE_BYTES;
}

/**
 * Format to re-encode as. JPEG stays JPEG; PNG becomes WebP, which keeps a
 * logo's transparency at a fraction of the size. Browsers that can't encode
 * WebP hand back PNG, and the upload is signed for what actually came back.
 */
export function encodeType(type: string): "image/jpeg" | "image/webp" {
  return type.toLowerCase() === "image/jpeg" ? "image/jpeg" : "image/webp";
}

/**
 * The file to upload: the re-encoded one only when it is an accepted type and
 * smaller than the original (re-encoding a small, well-compressed file can
 * make it bigger).
 */
export function pickUpload<T extends { type: string; size: number }>(original: T, resized: T | null): T {
  if (!resized || !allowedType(resized.type) || resized.size <= 0) return original;
  return resized.size < original.size ? resized : original;
}

/** Upload progress as a whole percentage in [0, 100]. */
export function percent(loaded: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
}

/** Copy of `list` with the item at `from` moved to `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const dest = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(dest, 0, item);
  return out;
}

/** Copy of `list` without the item at `index`. */
export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}
