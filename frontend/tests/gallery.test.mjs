// Coffee photo gallery helpers (lib/gallery.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_COFFEE_IMAGES } from "../lib/dashboard/upload.ts";
import { MAX_PHOTOS, clampIndex, galleryPhotos, stepIndex } from "../lib/gallery.ts";

test("the gallery shows as many photos as sellers can upload", () => {
  assert.equal(MAX_PHOTOS, MAX_COFFEE_IMAGES);
});

test("galleryPhotos keeps order, drops blanks and duplicates, caps at MAX_PHOTOS", () => {
  assert.deepEqual(galleryPhotos([]), []);
  assert.deepEqual(galleryPhotos(["a", "", "b", "a", "c"]), ["a", "b", "c"]);
  const many = Array.from({ length: 12 }, (_, i) => `p${i}`);
  assert.equal(galleryPhotos(many).length, MAX_PHOTOS);
  assert.equal(galleryPhotos(many)[0], "p0");
});

test("clampIndex falls back to the cover", () => {
  const cases = [
    [0, 3, 0],
    [2, 3, 2],
    [3, 3, 0],
    [-1, 3, 0],
    [1.5, 3, 0],
    [Number.NaN, 3, 0],
    [0, 0, 0],
  ];
  for (const [i, n, want] of cases) assert.equal(clampIndex(i, n), want, `${i}/${n}`);
});

test("stepIndex wraps both ways", () => {
  assert.equal(stepIndex(0, 3, 1), 1);
  assert.equal(stepIndex(2, 3, 1), 0);
  assert.equal(stepIndex(0, 3, -1), 2);
  assert.equal(stepIndex(9, 3, -1), 2); // out of range → from the cover
  assert.equal(stepIndex(0, 0, 1), 0);
});
