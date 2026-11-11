// Image upload helpers (lib/dashboard/upload.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  MAX_SOURCE_BYTES,
  encodeType,
  imageFileProblem,
  moveItem,
  needsShrinking,
  percent,
  pickUpload,
  removeAt,
  scaledSize,
} from "../lib/dashboard/upload.ts";

test("imageFileProblem", () => {
  const cases = [
    [{ type: "image/jpeg", size: 1 }, null],
    [{ type: "image/png", size: MAX_IMAGE_BYTES }, null],
    [{ type: "IMAGE/WEBP", size: 1000 }, null],
    [{ type: "image/png", size: MAX_IMAGE_BYTES + 1 }, "size"],
    [{ type: "image/png", size: 0 }, "size"],
    [{ type: "image/gif", size: 10 }, "type"],
    [{ type: "image/svg+xml", size: 10 }, "type"],
    [{ type: "", size: 10 }, "type"],
  ];
  for (const [file, want] of cases) assert.equal(imageFileProblem(file), want, JSON.stringify(file));
  // A chosen file may be larger, as long as it shrinks before upload (#212).
  assert.equal(imageFileProblem({ type: "image/jpeg", size: 12 * 1024 * 1024 }, MAX_SOURCE_BYTES), null);
  assert.equal(imageFileProblem({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 }, MAX_SOURCE_BYTES), "size");
  assert.equal(imageFileProblem({ type: "image/gif", size: 10 }, MAX_SOURCE_BYTES), "type");
});

test("scaledSize", () => {
  const cases = [
    { in: [4032, 3024], want: { width: 2000, height: 1500, scaled: true } },
    { in: [3024, 4032], want: { width: 1500, height: 2000, scaled: true } },
    { in: [MAX_IMAGE_SIDE, 10], want: { width: MAX_IMAGE_SIDE, height: 10, scaled: false } },
    { in: [800, 600], want: { width: 800, height: 600, scaled: false } },
    { in: [6000, 4000], want: { width: 2000, height: 1333, scaled: true } },
    // A panorama keeps at least one pixel of height.
    { in: [100000, 10], want: { width: 2000, height: 1, scaled: true } },
    { in: [0, 0], want: { width: 0, height: 0, scaled: false } },
  ];
  for (const c of cases) assert.deepEqual(scaledSize(...c.in), c.want, c.in.join("x"));
  assert.deepEqual(scaledSize(1000, 500, 100), { width: 100, height: 50, scaled: true });
});

test("needsShrinking", () => {
  assert.equal(needsShrinking({ size: 2_000_000 }, 4032, 3024), true, "too many pixels");
  assert.equal(needsShrinking({ size: MAX_IMAGE_BYTES + 1 }, 1800, 1200), true, "too many bytes");
  assert.equal(needsShrinking({ size: 300_000 }, 1600, 1200), false, "small: uploaded unchanged");
});

test("encodeType", () => {
  assert.equal(encodeType("image/jpeg"), "image/jpeg");
  assert.equal(encodeType("IMAGE/JPEG"), "image/jpeg");
  assert.equal(encodeType("image/png"), "image/webp", "keeps transparency, much smaller");
  assert.equal(encodeType("image/webp"), "image/webp");
});

test("pickUpload", () => {
  const original = { type: "image/jpeg", size: 4_000_000, name: "o" };
  const smaller = { type: "image/jpeg", size: 900_000, name: "r" };
  assert.equal(pickUpload(original, smaller), smaller);
  assert.equal(pickUpload(original, { ...smaller, size: 4_100_000 }), original, "bigger after re-encoding");
  assert.equal(pickUpload(original, { ...smaller, size: original.size }), original, "no gain");
  assert.equal(pickUpload(original, { ...smaller, type: "image/bmp" }), original, "a type the API refuses");
  assert.equal(pickUpload(original, { ...smaller, size: 0 }), original, "empty output");
  assert.equal(pickUpload(original, null), original, "couldn't encode");
  // A browser that can't encode WebP returns PNG: allowed, used when smaller.
  const png = { type: "image/png", size: 1_000_000, name: "p" };
  assert.equal(pickUpload({ type: "image/png", size: 8_000_000, name: "o" }, png), png);
});

test("percent", () => {
  const cases = [
    [0, 100, 0],
    [50, 100, 50],
    [1, 3, 33],
    [150, 100, 100],
    [10, 0, 0],
    [-5, 10, 0],
  ];
  for (const [loaded, total, want] of cases) assert.equal(percent(loaded, total), want, `${loaded}/${total}`);
});

test("moveItem and removeAt", () => {
  const xs = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(xs, 0, 1), ["b", "a", "c", "d"]);
  assert.deepEqual(moveItem(xs, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(xs, 1, -1), ["b", "a", "c", "d"]);
  assert.deepEqual(moveItem(xs, 2, 99), ["a", "b", "d", "c"]);
  assert.deepEqual(moveItem(xs, 9, 0), xs);
  assert.deepEqual(xs, ["a", "b", "c", "d"], "input untouched");
  assert.deepEqual(removeAt(xs, 1), ["a", "c", "d"]);
  assert.deepEqual(removeAt(xs, 7), xs);
});
