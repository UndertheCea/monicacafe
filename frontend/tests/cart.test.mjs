// Cart helpers (lib/cart.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CART_QUANTITY,
  MIN_CART_PRICE_TWD,
  canAddToCart,
  lineQuantityChoices,
  bagsLeft,
  cartBadgeText,
  cartErrorKey,
  cartLoginHref,
  cartProblem,
  groupByShop,
  inCartFor,
  parseCartChoice,
  quantityChoices,
} from "../lib/cart.ts";

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

test("cartProblem names the bags left, or sold out, when the server says so", () => {
  const cases = [
    { in: ["BAD_USER_INPUT", "quantity", 3], want: { key: "cart.error.onlyLeft", vars: { n: 3 } } },
    { in: ["BAD_USER_INPUT", "quantity", 0], want: { key: "cart.error.soldOut" } },
    { in: ["BAD_USER_INPUT", "quantity", undefined], want: { key: "cart.error.quantity" } },
    { in: ["BAD_USER_INPUT", "variantId", 2], want: { key: "cart.error.unavailable" } },
    { in: ["OWN_SHOP", undefined, undefined], want: { key: "cart.error.ownShop" } },
    { in: ["LIMIT_REACHED", undefined, undefined], want: { key: "cart.error.full" } },
  ];
  for (const c of cases) assert.deepEqual(cartProblem(...c.in), c.want, JSON.stringify(c.in));
});

test("inCartFor sums the lines of one option", () => {
  const items = [line("1", shopA, 450), { ...line("2", shopA, 450), quantity: 3 }];
  assert.equal(inCartFor(items, "v1"), 1);
  assert.equal(inCartFor(items, "v2"), 3);
  assert.equal(inCartFor(items, "nope"), 0);
});

test("bagsLeft is stock (max 20) minus the cart, lowered by what the server reported", () => {
  const cases = [
    { in: [10, 0], want: 10 },
    { in: [10, 4], want: 6 },
    { in: [60, 0], want: 20 },
    { in: [60, 5], want: 15 },
    { in: [3, 5], want: 0 },
    { in: [10, 0, 2], want: 2 },
    { in: [10, 0, 50], want: 10 },
    { in: [10, 0, 0], want: 0 },
    { in: [-1, 0], want: 0 },
  ];
  for (const c of cases) assert.equal(bagsLeft(...c.in), c.want, JSON.stringify(c.in));
});

test("cartBadgeText", () => {
  assert.equal(cartBadgeText(0), "");
  assert.equal(cartBadgeText(7), "7");
  assert.equal(cartBadgeText(99), "99");
  assert.equal(cartBadgeText(100), "99+");
  assert.equal(cartBadgeText(Number.NaN), "");
});

test("cartLoginHref keeps option and quantity in ?next= and the result stays a safe path", async () => {
  const { safeNext } = await import("../lib/auth/token.ts");
  const href = cartLoginHref("/coffees/abc", "v-1", 3);
  const next = new URL(href, "http://x").searchParams.get("next");
  assert.equal(next, "/coffees/abc?option=v-1&qty=3");
  assert.equal(safeNext(next), "/coffees/abc?option=v-1&qty=3");
});

test("parseCartChoice accepts known options and 1-20 only", () => {
  const ids = ["a", "b"];
  const cases = [
    { in: "?option=b&qty=4", want: { variantId: "b", quantity: 4 } },
    { in: "option=a", want: { variantId: "a" } },
    { in: "?option=zzz&qty=2", want: { quantity: 2 } },
    { in: "?qty=0", want: {} },
    { in: "?qty=21", want: {} },
    { in: "?qty=2.5", want: {} },
    { in: "?qty=-1", want: {} },
    { in: "?qty=abc&option=", want: {} },
    { in: "", want: {} },
    { in: "?qty=20", want: { quantity: 20 } },
  ];
  for (const c of cases) assert.deepEqual(parseCartChoice(c.in, ids), c.want, c.in);
});

test("canAddToCart: on sale, in stock and at least NT$1", () => {
  const ok = { isAvailable: true, stock: 3, priceTwd: 450 };
  const cases = [
    [ok, true],
    [{ ...ok, priceTwd: MIN_CART_PRICE_TWD }, true],
    [{ ...ok, priceTwd: 0 }, false],
    [{ ...ok, stock: 0 }, false],
    [{ ...ok, isAvailable: false }, false],
  ];
  for (const [v, want] of cases) assert.equal(canAddToCart(v), want, JSON.stringify(v));
});

test("lineQuantityChoices: an unbuyable line can only be lowered", () => {
  const mk = (available, stock, quantity) => ({ available, quantity, variant: { stock } });
  const cases = [
    [mk(true, 5, 2), [1, 2, 3, 4, 5]],
    [mk(true, 1, 3), [1, 2, 3]],
    [mk(false, 5, 2), [1, 2]],
    [mk(false, 0, 3), [1, 2, 3]],
  ];
  for (const [l, want] of cases) assert.deepEqual(lineQuantityChoices(l), want);
});
