// Draft-deletion helpers (lib/dashboard/deleteCoffee.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteCoffeeErrorKey, withoutCoffee } from "../lib/dashboard/deleteCoffee.ts";

test("deleteCoffeeErrorKey maps API codes", () => {
  const cases = [
    ["CONFLICT", "dash.error.deletePublished"],
    ["NOT_FOUND", "cf.notYours"],
    ["FORBIDDEN", "cf.notYours"],
    ["UNAVAILABLE", "dash.error.generic"],
    ["", "dash.error.generic"],
  ];
  for (const [code, want] of cases) assert.equal(deleteCoffeeErrorKey(code), want, code);
});

test("withoutCoffee drops the coffee and keeps the total in step", () => {
  const list = { total: 12, nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] };
  assert.deepEqual(withoutCoffee(list, "b"), { total: 11, nodes: [{ id: "a" }, { id: "c" }] });
  assert.deepEqual(withoutCoffee(list, "zzz"), list, "unknown id leaves the list alone");
  assert.deepEqual(withoutCoffee({ total: 0, nodes: [{ id: "a" }] }, "a"), { total: 0, nodes: [] }, "never negative");
  assert.equal(list.nodes.length, 3, "input not mutated");
});
