// Pure helpers for image uploads. No imports: `node --test` loads this directly.
// The API re-checks type and size (backend/internal/storage).

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_COFFEE_IMAGES = 8;

export type ImageProblem = "type" | "size";

/** Problem with a chosen file, or null when it can be uploaded. */
export function imageFileProblem(file: { type: string; size: number }): ImageProblem | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase())) return "type";
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return "size";
  return null;
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
