// Cart helpers (lib/cart.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CART_QUANTITY, cartErrorKey, groupByShop, quantityChoices } from "../lib/cart.ts";

const shopA = { slug: "a", name: "A 烘焙" };
const shopB = { slug: "b", name: "B Roasters" };
function line(id, shop, total, available = true) {
  return {
    id, quantity: 1, priceTwd: total, addedPriceTwd: total, priceChanged: false, available, lineTotalTwd: total,
    variant: { id: "v" + id, grind: "WHOLE_BEAN", weightG: 200, stock: 5, isAvailable: available },
    coffee: shop ? { id: "c" + id, name: "Coffee " + id, shop } : null,
  };
}

test("groupByShop keeps first-seen shop order, sums only buyable lines, puts gone coffees last", () => {
  const groups = groupByShop([
    line("1", shopA, 450),
    line("2", null, 300, false),
    line("3", shopB, 600),
    line("4", shopA, 500, false),
    line("5", shopA, 380),
  ]);
  assert.deepEqual(groups.map((g) => g.shop?.slug ?? null), ["a", "b", null]);
  assert.deepEqual(groups.map((g) => g.lines.map((l) => l.id)), [["1", "4", "5"], ["3"], ["2"]]);
  assert.deepEqual(groups.map((g) => g.subtotalTwd), [830, 600, 0]);
  assert.deepEqual(groupByShop([]), []);
});

test("quantityChoices offers 1..min(stock, 20) minus what's in the cart, never hides the current value", () => {
  const cases = [
    [[5], [1, 2, 3, 4, 5]],
    [[0], []],
    [[-2], []],
    [[100], Array.from({ length: MAX_CART_QUANTITY }, (_, i) => i + 1)],
    [[5, 3], [1, 2]],
    [[5, 5], []],
    [[2, 0, 4], [1, 2, 3, 4]],
    [[0, 0, 1], [1]],
  ];
  for (const [args, want] of cases) assert.deepEqual(quantityChoices(...args), want, JSON.stringify(args));
});

test("cartErrorKey maps API errors to messages", () => {
  assert.equal(cartErrorKey("LIMIT_REACHED", "cart"), "cart.error.full");
  assert.equal(cartErrorKey("BAD_USER_INPUT", "quantity"), "cart.error.quantity");
  assert.equal(cartErrorKey("BAD_USER_INPUT", "variantId"), "cart.error.unavailable");
  assert.equal(cartErrorKey("NOT_FOUND"), "cart.error.unavailable");
  assert.equal(cartErrorKey("INTERNAL_SERVER_ERROR"), "cart.error.generic");
});
