// Browser-only: scale a photo down before it is uploaded (#212). The rules
// (sizes, formats, which file wins) are pure helpers in lib/dashboard/upload.ts.
import { THUMB_QUALITY, MAX_THUMB_BYTES, thumbSize } from "@/lib/thumb";
import { stripMetadata } from "@/lib/dashboard/stripMetadata";
import { IMAGE_TYPES, RESIZE_QUALITY, encodeType, needsShrinking, pickUpload, scaledSize } from "@/lib/dashboard/upload";

/** Same name with the new format's extension, so the bucket key reads right. */
function renamed(name: string, type: string): string {
  const ext = type === "image/jpeg" ? "jpg" : type.split("/")[1] || "img";
  const base = name.replace(/\.[^.]*$/, "") || "photo";
  return `${base}.${ext}`;
}

/**
 * A 640 px-wide WebP copy of `file` to store beside the original (#235), or
 * null when the browser can't decode it or can't encode WebP (the page then
 * simply uses the original) or the result is over the API's thumbnail limit.
 */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const { width, height } = thumbSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", THUMB_QUALITY));
    return blob && blob.type === "image/webp" && blob.size > 0 && blob.size <= MAX_THUMB_BYTES ? blob : null;
  } finally {
    bitmap.close();
  }
}

/**
 * A smaller copy of `file` when it is larger than MAX_IMAGE_SIDE pixels or
 * MAX_IMAGE_BYTES bytes, else `file` itself. Anything the browser can't decode
 * or encode is returned unchanged; the size check after this decides whether
 * it can still be uploaded. Re-encoding also drops EXIF metadata (camera, GPS
 * position), which a public product photo shouldn't carry anyway.
 */
export async function shrinkImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" applies the EXIF rotation, so phone photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    if (!needsShrinking(file, bitmap.width, bitmap.height)) return file;
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, encodeType(file.type), RESIZE_QUALITY));
    if (!blob) return file;
    return pickUpload(file, new File([blob], renamed(file.name, blob.type), { type: blob.type, lastModified: file.lastModified }));
  } finally {
    bitmap.close();
  }
}

/** Always re-encode `file` through a canvas (applies orientation, drops all metadata); null when the browser can't. */
async function reencode(file: File): Promise<File | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, encodeType(file.type), RESIZE_QUALITY));
    if (!blob || blob.size <= 0 || !(IMAGE_TYPES as readonly string[]).includes(blob.type)) return null;
    return new File([blob], renamed(file.name, blob.type), { type: blob.type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/**
 * `file` without EXIF / XMP / GPS metadata (#285): its bytes pass through the
 * pure stripper; bytes the stripper can't parse are re-encoded through a
 * canvas instead. Null means neither worked, and the file must not be uploaded.
 */
export async function stripImage(file: File): Promise<File | null> {
  try {
    const clean = stripMetadata(new Uint8Array(await file.arrayBuffer()));
    if (clean) return new File([clean as BlobPart], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    // fall through to the canvas
  }
  return reencode(file);
}

/** Thumbnail bytes through the same stripper (a canvas WebP carries none, but nothing is assumed). */
export async function stripThumbnail(blob: Blob | null): Promise<Blob | null> {
  if (!blob) return null;
  const clean = await stripImage(new File([blob], "thumb.webp", { type: blob.type }));
  return clean && clean.size <= MAX_THUMB_BYTES ? clean : null;
}
