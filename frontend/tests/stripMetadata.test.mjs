// Metadata stripping (lib/dashboard/stripMetadata.ts, #285). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stripMetadata, tiffOrientation } from "../lib/dashboard/stripMetadata.ts";

const bytes = (...parts) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : [...p])));
const u16 = (n) => [n >> 8, n & 255];
const u32be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const has = (hay, needle) => Buffer.from(hay).includes(Buffer.from(needle));

/** Little-endian TIFF with IFD0 {Make "Acme", Orientation, GPS IFD pointer} and a GPS IFD with a latitude ref. */
function exifTiff(orientation) {
  const le16 = (n) => [n & 255, n >> 8];
  const entry = (tag, type, count, val) => [...le16(tag), ...le16(type), ...u32le(count), ...val];
  const ifd0At = 8;
  const ifd0Len = 2 + 3 * 12 + 4;
  const gpsAt = ifd0At + ifd0Len;
  return bytes(
    "II", le16(42), u32le(ifd0At),
    le16(3),
    entry(0x010f, 2, 4, "Acme"), // Make
    entry(0x0112, 3, 1, [...le16(orientation), 0, 0]), // Orientation
    entry(0x8825, 4, 1, u32le(gpsAt)), // GPS IFD pointer
    u32le(0),
    le16(1), entry(0x0001, 2, 2, "N\0\0\0"), u32le(0), // GPSLatitudeRef
    "GPSSECRET",
  );
}

function jpeg(orientation, { extra = [] } = {}) {
  const exif = bytes("Exif\0\0", exifTiff(orientation));
  const seg = (m, payload) => [0xff, m, ...u16(payload.length + 2), ...payload];
  return bytes(
    [0xff, 0xd8],
    seg(0xe0, bytes("JFIF\0", [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    seg(0xe1, exif),
    seg(0xe1, bytes("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta GPSXMP/>")),
    seg(0xed, bytes("Photoshop 3.0\0IPTC")),
    seg(0xfe, bytes("comment-with-secret")),
    seg(0xdb, [0, ...new Array(64).fill(8)]),
    ...extra,
    [0xff, 0xda, 0, 3, 0], // SOS (header only; the scan follows)
    [0x12, 0x34, 0xff, 0x00, 0x56], // entropy data with a stuffed FF
    [0xff, 0xd9],
    "TRAILING-GPS", // trailing junk after EOI
  );
}

// The stripper copies chunks verbatim and never checks CRCs, so a zero CRC will do.
const chunk = (type, data) => [...u32be(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];

function png() {
  const text = [...Buffer.from("Location\0GPS 25.03,121.56")];
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    chunk("sRGB", [0]),
    chunk("eXIf", [...exifTiff(6)]),
    chunk("tEXt", text),
    chunk("zTXt", text),
    chunk("iTXt", text),
    chunk("tIME", [7, 0xe9, 1, 1, 0, 0, 0]),
    chunk("pHYs", [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]),
    chunk("IDAT", [1, 2, 3, 4]),
    chunk("IEND", []),
    "TRAILING-GPS",
  );
}

const riff = (...chunks) => {
  const body = bytes("WEBP", ...chunks);
  return bytes("RIFF", u32le(body.length), body);
};
const wchunk = (type, data) => bytes(type, u32le(data.length), data, data.length % 2 ? [0] : []);

function webp(orientation, { withVp8x = true } = {}) {
  const flags = 0x10 | 0x20 | 0x08 | 0x04; // alpha, ICC, EXIF, XMP
  return riff(
    ...(withVp8x ? [wchunk("VP8X", [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0])] : []),
    wchunk("ICCP", [9, 9, 9]),
    wchunk("VP8 ", [1, 2, 3, 4, 5]),
    wchunk("EXIF", exifTiff(orientation)),
    wchunk("XMP ", bytes("<x:xmpmeta GPSXMP/>")),
  );
}

test("tiffOrientation reads the tag in either byte order", () => {
  assert.equal(tiffOrientation(exifTiff(6)), 6);
  assert.equal(tiffOrientation(exifTiff(1)), 1);
  assert.equal(tiffOrientation(bytes("MM", u16(42), u32be(8), u16(1), u16(0x0112), u16(3), u32be(1), u16(8), [0, 0], u32be(0))), 8);
  assert.equal(tiffOrientation(exifTiff(9)), 1); // out of range
  assert.equal(tiffOrientation(bytes("II", [42, 0, 255, 255, 255, 255])), 1); // IFD offset past the end
  assert.equal(tiffOrientation(new Uint8Array(3)), 1);
});

test("jpeg: orientation 1 drops every metadata segment and keeps the image", () => {
  const out = stripMetadata(jpeg(1));
  assert.ok(out);
  for (const s of ["Exif", "GPS", "Acme", "xmp", "Photoshop", "comment", "TRAILING"]) assert.equal(has(out, s), false, s);
  assert.ok(has(out, "JFIF")); // APP0 kept
  assert.ok(has(out, [0xff, 0xdb])); // quantisation table kept
  assert.ok(has(out, [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9])); // scan data + EOI
  assert.deepEqual([out[0], out[1]], [0xff, 0xd8]);
  assert.deepEqual([out[out.length - 2], out[out.length - 1]], [0xff, 0xd9]);
});

test("jpeg: orientation != 1 is kept in a minimal Exif with nothing else", () => {
  const out = stripMetadata(jpeg(6));
  assert.ok(out);
  for (const s of ["GPS", "Acme", "xmp", "Photoshop", "comment", "TRAILING"]) assert.equal(has(out, s), false, s);
  const at = Buffer.from(out).indexOf("Exif\0\0");
  assert.ok(at > 0);
  assert.equal(tiffOrientation(out.subarray(at + 6)), 6);
  assert.equal(Buffer.from(out).indexOf("Exif", at + 1), -1); // only one Exif block
  assert.ok(has(out, [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]));
});

test("jpeg: keeps an ICC profile, drops other APP2", () => {
  const seg = (payload) => [0xff, 0xe2, ...u16(payload.length + 2), ...payload];
  const out = stripMetadata(jpeg(1, { extra: [seg(bytes("ICC_PROFILE\0", [1, 1, 7])), seg(bytes("MPF\0secret"))] }));
  assert.ok(has(out, "ICC_PROFILE"));
  assert.equal(has(out, "MPF"), false);
});

test("jpeg: garbled input is refused", () => {
  assert.equal(stripMetadata(jpeg(1).subarray(0, 40)), null); // cut off before the scan ends
  assert.equal(stripMetadata(bytes([0xff, 0xd8, 0x00, 0x00])), null);
  assert.equal(stripMetadata(new Uint8Array(0)), null);
  assert.equal(stripMetadata(bytes("GIF89a....")), null);
});

test("png: drops eXIf, tEXt, zTXt, iTXt and tIME, keeps the rest", () => {
  const out = stripMetadata(png());
  assert.ok(out);
  for (const s of ["eXIf", "tEXt", "zTXt", "iTXt", "tIME", "GPS", "Acme", "TRAILING"]) assert.equal(has(out, s), false, s);
  for (const s of ["IHDR", "sRGB", "pHYs", "IDAT", "IEND"]) assert.ok(has(out, s), s);
  assert.ok(has(out, [1, 2, 3, 4]));
  assert.equal(stripMetadata(png().subarray(0, 60)), null); // no IEND
});

test("webp: drops EXIF and XMP chunks and clears the VP8X flags", () => {
  const out = stripMetadata(webp(1));
  assert.ok(out);
  for (const s of ["EXIF", "XMP ", "GPS", "Acme"]) assert.equal(has(out, s), false, s);
  for (const s of ["VP8X", "ICCP", "VP8 "]) assert.ok(has(out, s), s);
  assert.ok(has(out, [1, 2, 3, 4, 5]));
  const vp8x = Buffer.from(out).indexOf("VP8X");
  assert.equal(out[vp8x + 8] & 0x0c, 0); // EXIF + XMP flags cleared
  assert.equal(out[vp8x + 8] & 0x30, 0x30); // alpha + ICC kept
  assert.equal(new DataView(out.buffer, out.byteOffset).getUint32(4, true), out.length - 8); // RIFF size
});

test("webp: orientation != 1 survives as a minimal EXIF chunk", () => {
  const out = stripMetadata(webp(3));
  assert.ok(out);
  for (const s of ["GPS", "Acme", "XMP "]) assert.equal(has(out, s), false, s);
  const vp8x = Buffer.from(out).indexOf("VP8X");
  assert.equal(out[vp8x + 8] & 0x0c, 0x08);
  const exif = Buffer.from(out).indexOf("EXIF");
  assert.ok(exif > 0);
  assert.equal(tiffOrientation(out.subarray(exif + 8)), 3);
  assert.equal(new DataView(out.buffer, out.byteOffset).getUint32(4, true), out.length - 8);
});

test("webp: a simple file without VP8X loses its EXIF; garbled input is refused", () => {
  const out = stripMetadata(webp(6, { withVp8x: false }));
  assert.ok(out);
  assert.equal(has(out, "EXIF"), false);
  assert.equal(has(out, "GPS"), false);
  assert.ok(has(out, [1, 2, 3, 4, 5]));
  assert.equal(stripMetadata(bytes("RIFF", u32le(4), "WEBP")), null); // no image chunk
  assert.equal(stripMetadata(webp(1).subarray(0, 30)), null);
});
