// Cart UI decisions (lib/cartUi.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addToCartMode, chosenQuantity, focusTargetAfterRemove, quantityChanged } from "../lib/cartUi.ts";

test("addToCartMode shows the sign-in link until the visitor is known to be signed in", () => {
  assert.equal(addToCartMode("loading"), "login");
  assert.equal(addToCartMode("anonymous"), "login");
  assert.equal(addToCartMode("authenticated"), "add");
});

test("chosenQuantity and quantityChanged compare the draft with the saved quantity", () => {
  assert.equal(chosenQuantity(2, undefined), 2);
  assert.equal(chosenQuantity(2, 5), 5);
  assert.equal(quantityChanged(2, undefined), false);
  assert.equal(quantityChanged(2, 2), false);
  assert.equal(quantityChanged(2, 3), true);
});

test("focusTargetAfterRemove prefers the next line, then the previous, then the heading", () => {
  const cases = [
    [["a", "b", "c"], "a", { kind: "line", id: "b" }],
    [["a", "b", "c"], "b", { kind: "line", id: "c" }],
    [["a", "b", "c"], "c", { kind: "line", id: "b" }],
    [["a"], "a", { kind: "heading" }],
    [[], "a", { kind: "heading" }],
  ];
  for (const [ids, removed, want] of cases) assert.deepEqual(focusTargetAfterRemove(ids, removed), want);
});
