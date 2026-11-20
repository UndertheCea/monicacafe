// Option-row save helpers (lib/dashboard/variantSave.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { variantRowDirty, variantSaveErrorKey, variantUpdateInput } from "../lib/dashboard/variantSave.ts";

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

test("variantRowDirty compares the checkbox with the stored switch, not with isAvailable (#318)", () => {
  // Sold out and switched off, just saved: the API says isAvailable false and
  // onSale false; the row shows "off", so nothing is left to save.
  const soldOutOff = { priceTwd: 450, stock: 0, isAvailable: false, onSale: false };
  assert.equal(variantRowDirty(soldOutOff, { priceTwd: 450, stock: 0, onSale: false }), false);
  // Sold out but switched on: unchanged row isn't dirty either.
  const soldOutOn = { priceTwd: 450, stock: 0, isAvailable: false, onSale: true };
  assert.equal(variantRowDirty(soldOutOn, { priceTwd: 450, stock: 0, onSale: true }), false);
  assert.equal(variantRowDirty(soldOutOn, { priceTwd: 450, stock: 0, onSale: false }), true);
  assert.equal(variantRowDirty(soldOutOn, { priceTwd: 450, stock: 5, onSale: true }), true);
  assert.equal(variantRowDirty(soldOutOn, { priceTwd: 480, stock: 0, onSale: true }), true);
  // An unparseable field counts as a change (Save then shows the field error).
  assert.equal(variantRowDirty(soldOutOn, { priceTwd: null, stock: 0, onSale: true }), true);
});

test("variantRowDirty: an untouched NT$0 option stored before #358 is not dirty (#434)", () => {
  const legacy = { priceTwd: 0, stock: 3, onSale: true };
  // parseWhole("0", 1, …) is null; the text still equals the stored value.
  assert.equal(variantRowDirty(legacy, { priceTwd: null, stock: 3, onSale: true, priceText: "0", stockText: "3" }), false);
  assert.equal(variantRowDirty(legacy, { priceTwd: null, stock: 3, onSale: true, priceText: " 0 ", stockText: "3" }), false);
  // Edited price, cleared box or toggled switch are changes.
  assert.equal(variantRowDirty(legacy, { priceTwd: 450, stock: 3, onSale: true, priceText: "450", stockText: "3" }), true);
  assert.equal(variantRowDirty(legacy, { priceTwd: null, stock: 3, onSale: true, priceText: "", stockText: "3" }), true);
  assert.equal(variantRowDirty(legacy, { priceTwd: null, stock: 3, onSale: false, priceText: "0", stockText: "3" }), true);
});
