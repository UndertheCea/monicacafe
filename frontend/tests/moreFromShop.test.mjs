// "More from this shop" helper (lib/moreFromShop.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MORE_FROM_SHOP, SIMILAR_COFFEES, alsoLike, moreFromShop } from "../lib/moreFromShop.ts";

test("moreFromShop drops the current coffee and caps the count", () => {
  const ids = (xs) => xs.map((id) => ({ id }));
  const cases = [
    ["nothing else", ["cur"], [], 4],
    ["empty shop list", [], [], 4],
    ["current in the middle", ["a", "cur", "b"], ["a", "b"], 4],
    ["capped", ["a", "b", "c", "d", "e"], ["a", "b", "c", "d"], 4],
    ["current excluded before capping", ["cur", "a", "b", "c", "d"], ["a", "b", "c", "d"], 4],
    ["duplicates dropped", ["a", "a", "b"], ["a", "b"], 4],
    ["custom max", ["a", "b", "c"], ["a"], 1],
  ];
  for (const [name, input, want, max] of cases) {
    assert.deepEqual(moreFromShop(ids(input), "cur", max).map((c) => c.id), want, name);
  }
  assert.equal(MORE_FROM_SHOP, 4);
});

test("alsoLike skips the current coffee and anything already shown, keeps API order, caps", () => {
  const ids = (xs) => xs.map((id) => ({ id }));
  const cases = [
    ["empty", [], [], []],
    ["keeps order", ["a", "b", "c"], [], ["a", "b", "c"]],
    ["drops shown + current + repeats", ["cur", "a", "s1", "b", "a"], ["s1", "s2"], ["a", "b"]],
    ["caps", ["a", "b", "c", "d", "e", "f"], [], ["a", "b", "c", "d"].slice(0, SIMILAR_COFFEES)],
  ];
  for (const [name, similar, shown, want] of cases) {
    assert.deepEqual(alsoLike(ids(similar), ids(shown), "cur").map((c) => c.id), want, name);
  }
});
