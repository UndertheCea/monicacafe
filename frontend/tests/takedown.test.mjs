// Moderation blocks on the dashboard (lib/dashboard/takedown.ts, #282). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canAddCoffee, moderationBlockKey } from "../lib/dashboard/takedown.ts";
import { duplicateCoffeeErrorKey } from "../lib/dashboard/duplicateCoffee.ts";

test("moderationBlockKey maps only the moderation codes", () => {
  const cases = [
    ["SHOP_SUSPENDED", "dash.error.shopSuspended"],
    ["TAKEN_DOWN", "dash.error.takenDown"],
    ["CONFLICT", null],
    ["FORBIDDEN", null],
    ["", null],
  ];
  for (const [code, want] of cases) assert.equal(moderationBlockKey(code), want, code);
});

test("duplicateCoffeeErrorKey explains a takedown before anything else", () => {
  assert.equal(duplicateCoffeeErrorKey("TAKEN_DOWN"), "dash.error.takenDown");
  assert.equal(duplicateCoffeeErrorKey("SHOP_SUSPENDED"), "dash.error.shopSuspended");
  assert.equal(duplicateCoffeeErrorKey("LIMIT_REACHED"), "dash.error.coffeeLimit");
});

test("canAddCoffee: no New coffee button while the shop is suspended (#431)", () => {
  assert.equal(canAddCoffee({ suspended: false }), true);
  assert.equal(canAddCoffee({ suspended: true }), false);
});
