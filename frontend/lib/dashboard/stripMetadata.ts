// Pure, DOM-free metadata stripper for uploaded photos (#285). No imports:
// `node --test` loads this directly.
//
// A phone photo can carry GPS position, phone model and capture time (EXIF,
// XMP, IPTC, comments). The API never sees the bytes (presigned PUT), so the
// browser removes them before upload.
//
// Orientation design (option b): the Exif Orientation tag is the only EXIF
// value that changes how the picture looks, so when the original says
// something other than 1 we keep it by writing a minimal 26-byte TIFF block
// holding just that tag (JPEG APP1 / WebP EXIF chunk). Everything else (GPS,
// make/model, time, thumbnails, maker notes, XMP, IPTC, COM) is dropped. When
// the orientation is 1 or absent no EXIF is written at all. PNG: eXIf, tEXt,
// zTXt, iTXt and tIME are dropped; browsers rarely use eXIf orientation in
// PNG, so it is not preserved there. A WebP without a VP8X header (simple
// file) has no place to flag an EXIF chunk, so its orientation is not kept.
//
// Returns null for bytes that are not a well-formed JPEG / PNG / WebP; the
// caller then falls back to a canvas re-encode (which also drops metadata).

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

const ascii = (b: Uint8Array, at: number, s: string) => {
  if (at < 0 || at + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u32le = (b: Uint8Array, at: number) => ((b[at + 3] << 24) | (b[at + 2] << 16) | (b[at + 1] << 8) | b[at]) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Orientation (1-8) from a TIFF block (the bytes after "Exif\0\0"), or 1 when absent or unreadable. */
export function tiffOrientation(tiff: Uint8Array): number {
  if (tiff.length < 8) return 1;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!le && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return 1;
  const u16 = (at: number) => (le ? tiff[at] | (tiff[at + 1] << 8) : (tiff[at] << 8) | tiff[at + 1]);
  const u32 = (at: number) => (le ? u32le(tiff, at) : u32be(tiff, at));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) return 1;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** A TIFF block holding only the Orientation tag (big-endian, 26 bytes). */
function minimalTiff(orientation: number): Uint8Array {
  return Uint8Array.from([
    0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, // header, IFD0 at 8
    0, 1, // one entry
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation, SHORT, count 1
    0, 0, 0, 0, // no next IFD
  ]);
}

function jpegExifSegment(orientation: number): Uint8Array {
  const payload = concat([Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0]), minimalTiff(orientation)]);
  const len = payload.length + 2;
  return concat([Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff]), payload]);
}

function webpExifChunk(orientation: number): Uint8Array {
  const tiff = minimalTiff(orientation);
  const out = new Uint8Array(8 + tiff.length);
  out.set([0x45, 0x58, 0x49, 0x46], 0);
  new DataView(out.buffer).setUint32(4, tiff.length, true);
  out.set(tiff, 8);
  return out; // 26 bytes of data: even, so no pad byte
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [];
  let orientation = 1;
  let at = 2;
  while (at < b.length) {
    if (b[at] !== 0xff) return null;
    while (at < b.length && b[at] === 0xff) at++; // fill bytes
    if (at >= b.length) return null;
    const marker = b[at++];
    if (marker === 0xd9) return null; // EOI before any scan
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      kept.push(Uint8Array.from([0xff, marker]));
      continue;
    }
    if (at + 2 > b.length) return null;
    const len = (b[at] << 8) | b[at + 1];
    if (len < 2 || at + len > b.length) return null;
    const payload = b.subarray(at + 2, at + len);
    const whole = Uint8Array.from([0xff, marker, ...b.subarray(at, at + len)]);
    at += len;
    if (marker === 0xe1 && ascii(payload, 0, "Exif\0\0")) {
      orientation = tiffOrientation(payload.subarray(6));
      continue;
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    // Keep JFIF (APP0), the ICC colour profile (APP2) and Adobe's colour flag (APP14);
    // drop every other APPn (Exif, XMP, IPTC, ...) and COM. Non-APP segments carry image data.
    const keep = isApp ? marker === 0xe0 || marker === 0xee || (marker === 0xe2 && ascii(payload, 0, "ICC_PROFILE\0")) : marker !== 0xfe;
    if (keep) kept.push(whole);
    if (marker === 0xda) {
      // Entropy-coded data: an unstuffed FF D9 can only be the end of image. Anything after it is dropped.
      let end = -1;
      for (let i = at; i + 1 < b.length; i++) {
        if (b[i] === 0xff && b[i + 1] === 0xd9) {
          end = i + 2;
          break;
        }
      }
      if (end < 0) return null;
      kept.push(b.subarray(at, end));
      return concat([Uint8Array.from([0xff, 0xd8]), ...(orientation === 1 ? [] : [jpegExifSegment(orientation)]), ...kept]);
    }
  }
  return null;
}

function stripPng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 || PNG_SIG.some((v, i) => b[i] !== v)) return null;
  const kept: Uint8Array[] = [b.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= b.length) {
    const len = u32be(b, at);
    const end = at + 12 + len;
    if (end > b.length) return null;
    const type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);
    if (!PNG_DROP.has(type)) kept.push(b.subarray(at, end));
    at = end;
    if (type === "IEND") return concat(kept); // anything after IEND is dropped
  }
  return null;
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 12 || !ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) return null;
  const total = u32le(b, 4) + 8;
  if (total > b.length) return null; // truncated
  const chunks: { type: string; whole: Uint8Array }[] = [];
  let at = 12;
  let orientation = 1;
  while (at + 8 <= total) {
    const len = u32le(b, at + 4);
    const end = at + 8 + len + (len & 1);
    if (end > b.length + (len & 1)) return null;
    const type = String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
    const data = b.subarray(at + 8, at + 8 + len);
    if (data.length < len) return null;
    if (type === "EXIF") {
      // Some writers prefix "Exif\0\0"; the spec says they shouldn't.
      orientation = tiffOrientation(ascii(data, 0, "Exif\0\0") ? data.subarray(6) : data);
    } else if (type !== "XMP ") {
      const whole = concat([b.subarray(at, at + 8 + len), new Uint8Array(len & 1)]);
      chunks.push({ type, whole });
    }
    at = end;
  }
  if (!chunks.some((c) => c.type === "VP8 " || c.type === "VP8L" || c.type === "VP8X")) return null;
  const parts: Uint8Array[] = [];
  for (const c of chunks) {
    if (c.type === "VP8X" && c.whole.length >= 18) {
      const hdr = Uint8Array.from(c.whole);
      hdr[8] = (hdr[8] & ~0x0c) | (orientation !== 1 ? 0x08 : 0); // clear the XMP (0x04) flag; EXIF (0x08) only when kept
      parts.push(hdr);
      if (orientation !== 1) parts.push(webpExifChunk(orientation));
    } else {
      parts.push(c.whole);
    }
  }
  const body = concat(parts);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  head.set([0x57, 0x45, 0x42, 0x50], 8);
  return concat([head, body]);
}

/** The bytes without EXIF / XMP / IPTC / comment metadata (orientation kept), or null if not a well-formed JPEG, PNG or WebP. */
export function stripMetadata(bytes: Uint8Array): Uint8Array | null {
  try {
    return stripJpeg(bytes) ?? stripPng(bytes) ?? stripWebp(bytes);
  } catch {
    return null;
  }
}
