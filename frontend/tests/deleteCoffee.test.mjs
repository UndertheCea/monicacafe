// Draft-deletion helpers (lib/dashboard/deleteCoffee.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteCoffeeError, deleteCoffeeErrorKey, withoutCoffee } from "../lib/dashboard/deleteCoffee.ts";

test("deleteCoffeeErrorKey maps API codes", () => {
  const cases = [
    ["CONFLICT", "dash.error.deletePublished"],
    ["NOT_FOUND", "cf.notYours"],
    ["FORBIDDEN", "cf.notYours"],
    ["UNAVAILABLE", "dash.error.generic"],
    ["", "dash.error.generic"],
    ["SHOP_SUSPENDED", "dash.error.shopSuspended"],
    ["TAKEN_DOWN", "dash.error.takenDown"],
  ];
  for (const [code, want] of cases) assert.equal(deleteCoffeeErrorKey(code), want, code);
  // An open report blocks deletion (#282): its own message, by field.
  assert.equal(deleteCoffeeErrorKey("CONFLICT", "reports"), "dash.error.deleteReported");
  assert.equal(deleteCoffeeErrorKey("CONFLICT", "isPublished"), "dash.error.deletePublished");
});

test("withoutCoffee drops the coffee and keeps the total in step", () => {
  const list = { total: 12, nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] };
  assert.deepEqual(withoutCoffee(list, "b"), { total: 11, nodes: [{ id: "a" }, { id: "c" }] });
  assert.deepEqual(withoutCoffee(list, "zzz"), list, "unknown id leaves the list alone");
  assert.deepEqual(withoutCoffee({ total: 0, nodes: [{ id: "a" }] }, "a"), { total: 0, nodes: [] }, "never negative");
  assert.equal(list.nodes.length, 3, "input not mutated");
});

test("deleteCoffeeError keeps the wait when the seller deleted too often (#532)", () => {
  assert.deepEqual(deleteCoffeeError("RATE_LIMITED", undefined, 30), { key: "error.rateLimitedSec.other", vars: { n: 30 } });
  assert.deepEqual(deleteCoffeeError("RATE_LIMITED"), { key: "error.rateLimitedMin.one", vars: { n: 1 } });
  assert.deepEqual(deleteCoffeeError("CONFLICT", "reports"), { key: "dash.error.deleteReported" });
  assert.deepEqual(deleteCoffeeError("TAKEN_DOWN"), { key: "dash.error.takenDown" });
  assert.deepEqual(deleteCoffeeError("INTERNAL_SERVER_ERROR"), { key: "dash.error.generic" });
});
