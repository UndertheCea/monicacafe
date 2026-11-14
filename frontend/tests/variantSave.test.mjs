// Option-row save helpers (lib/dashboard/variantSave.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { variantSaveErrorKey, variantUpdateInput } from "../lib/dashboard/variantSave.ts";

test("variantUpdateInput sends stock only when changed, always with the stock last seen", () => {
  const cases = [
    ["price only", { stock: 5 }, { priceTwd: 480, stock: 5 }, undefined, { priceTwd: 480 }],
    ["stock changed", { stock: 5 }, { priceTwd: 450, stock: 12 }, undefined, { priceTwd: 450, stock: 12, expectedStock: 5 }],
    ["stock to zero", { stock: 3 }, { priceTwd: 450, stock: 0 }, undefined, { priceTwd: 450, stock: 0, expectedStock: 3 }],
    ["toggle only", { stock: 0 }, { priceTwd: 450, stock: 0 }, false, { priceTwd: 450, isAvailable: false }],
    ["everything", { stock: 1 }, { priceTwd: 1, stock: 2 }, true, { priceTwd: 1, stock: 2, expectedStock: 1, isAvailable: true }],
  ];
  for (const [name, loaded, next, avail, want] of cases) {
    assert.deepEqual(variantUpdateInput(loaded, next, avail), want, name);
  }
});

test("variantSaveErrorKey maps API codes to messages", () => {
  assert.equal(variantSaveErrorKey("STOCK_CHANGED"), "cf.error.stockChanged");
  assert.equal(variantSaveErrorKey("CONFLICT"), "cf.error.duplicate");
  assert.equal(variantSaveErrorKey("INTERNAL_SERVER_ERROR"), "cf.error.generic");
  assert.equal(variantSaveErrorKey("UNAVAILABLE"), "cf.error.generic");
});
