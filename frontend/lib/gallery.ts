// Coffee photo gallery state. No imports, so `npm test` can load it directly.

/** Sellers can save at most this many photos (UpdateCoffeeInput.imageUrls; = MAX_COFFEE_IMAGES, pinned by a test). */
export const MAX_PHOTOS = 8;

/** The photos a gallery shows: de-duplicated, in saved order (first = cover), capped. */
export function galleryPhotos(urls: readonly string[]): string[] {
  return [...new Set(urls.filter((u) => u))].slice(0, MAX_PHOTOS);
}

/** A valid selected index for `count` photos (0 when out of range or not an integer). */
export function clampIndex(i: number, count: number): number {
  return Number.isInteger(i) && i >= 0 && i < count ? i : 0;
}

/** Next selection for arrow keys (wraps around); -1 = previous, 1 = next. */
export function stepIndex(i: number, count: number, dir: -1 | 1): number {
  if (count <= 0) return 0;
  return (clampIndex(i, count) + dir + count) % count;
}
