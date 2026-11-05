// Image upload helpers (lib/dashboard/upload.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_IMAGE_BYTES, imageFileProblem, moveItem, percent, removeAt } from "../lib/dashboard/upload.ts";

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
