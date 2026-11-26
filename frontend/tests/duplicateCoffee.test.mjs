// Duplicate-coffee helpers (lib/dashboard/duplicateCoffee.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_COFFEE_NAME, MAX_COFFEES_PER_SHOP, copyName, duplicateCoffeeError, duplicateCoffeeErrorKey } from "../lib/dashboard/duplicateCoffee.ts";

test("copyName appends the suffix and fits the API limit", () => {
  const cases = [
    ["Kenya AA", " (copy)", "Kenya AA (copy)"],
    ["  肯亞  ", "（複本）", "肯亞（複本）"],
    ["咖".repeat(120), " (copy)", "咖".repeat(113) + " (copy)"],
    ["a".repeat(112) + " bcd", " (copy)", "a".repeat(112) + " (copy)"],
    ["☕".repeat(118), "（複本）", "☕".repeat(116) + "（複本）"],
  ];
  for (const [name, suffix, want] of cases) {
    const got = copyName(name, suffix);
    assert.equal(got, want, name.slice(0, 10));
    assert.ok([...got].length <= MAX_COFFEE_NAME);
  }
});

test("duplicateCoffeeErrorKey maps API codes", () => {
  assert.equal(duplicateCoffeeErrorKey("FORBIDDEN"), "cf.notYours");
  assert.equal(duplicateCoffeeErrorKey("NOT_FOUND"), "cf.notYours");
  assert.equal(duplicateCoffeeErrorKey("RATE_LIMITED"), "dash.error.generic");
  assert.equal(duplicateCoffeeErrorKey("LIMIT_REACHED"), "dash.error.coffeeLimit");
});

test("duplicateCoffeeError keeps the wait when the seller duplicated too often (#532)", () => {
  assert.deepEqual(duplicateCoffeeError("RATE_LIMITED", 120), { key: "error.rateLimitedMin.other", vars: { n: 2 } });
  assert.deepEqual(duplicateCoffeeError("LIMIT_REACHED"), { key: "dash.error.coffeeLimit", vars: { max: MAX_COFFEES_PER_SHOP } });
  assert.deepEqual(duplicateCoffeeError("SHOP_SUSPENDED").key, "dash.error.shopSuspended");
  assert.equal(duplicateCoffeeError("NOT_FOUND").key, "cf.notYours");
});
