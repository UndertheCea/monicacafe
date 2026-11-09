// Dashboard coffee paging helpers (lib/dashboard/coffeePages.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DASH_COFFEES_PAGE, appendCoffeePage, hasMoreCoffees, withPublished } from "../lib/dashboard/coffeePages.ts";

const ids = (xs) => xs.map((id) => ({ id }));

test("appendCoffeePage keeps order, drops repeats and takes the new total", () => {
  const cases = [
    ["next page", ["a", "b"], 4, ["c", "d"], 4, ["a", "b", "c", "d"]],
    ["shifted page", ["a", "b"], 4, ["b", "c"], 5, ["a", "b", "c"]],
    ["empty page", ["a"], 3, [], 1, ["a"]],
  ];
  for (const [name, shown, total, page, newTotal, want] of cases) {
    const got = appendCoffeePage({ total, nodes: ids(shown) }, { total: newTotal, nodes: ids(page) });
    assert.deepEqual(got.nodes.map((c) => c.id), want, name);
    assert.equal(got.total, newTotal, name);
  }
});

test("hasMoreCoffees", () => {
  const full = DASH_COFFEES_PAGE;
  const cases = [
    ["more to load", full, 120, full, true],
    ["all listed", 120, 120, 20, false],
    ["short page ends it even with a stale total", 70, 120, 20, false],
    ["nothing", 0, 0, 0, false],
  ];
  for (const [name, listed, total, last, want] of cases) assert.equal(hasMoreCoffees(listed, total, last), want, name);
});

test("withPublished flips only the given coffee", () => {
  const list = { total: 9, nodes: [{ id: "a", isPublished: false }, { id: "b", isPublished: true }] };
  assert.deepEqual(withPublished(list, "a", true), {
    total: 9,
    nodes: [{ id: "a", isPublished: true }, { id: "b", isPublished: true }],
  });
  assert.deepEqual(withPublished(list, "zzz", true), list);
});

test("moveItem moves one place up or down and ignores moves off either end", async () => {
  const { moveItem } = await import("../lib/dashboard/coffeePages.ts");
  const list = ["a", "b", "c", "d"];
  const cases = [
    [0, 1, ["b", "a", "c", "d"]],
    [3, -1, ["a", "b", "d", "c"]],
    [1, -1, ["b", "a", "c", "d"]],
    [2, 1, ["a", "b", "d", "c"]],
    [0, 3, ["b", "c", "d", "a"]],
    [0, -1, list],
    [3, 1, list],
    [5, -1, list],
    [-1, 1, list],
    [1, 0, list],
    [1.5, 1, list],
  ];
  for (const [i, d, want] of cases) assert.deepEqual(moveItem(list, i, d), want, `${i}${d >= 0 ? "+" : ""}${d}`);
  assert.equal(moveItem(list, 0, -1), list, "no-op returns the same array");
  assert.deepEqual(list, ["a", "b", "c", "d"], "input untouched");
  assert.deepEqual(moveItem([], 0, 1), []);
});

test("canReorder needs every coffee loaded and more than one", async () => {
  const { canReorder } = await import("../lib/dashboard/coffeePages.ts");
  const cases = [
    [0, 0, false],
    [1, 1, false],
    [2, 2, true],
    [50, 51, false],
    [51, 51, true],
  ];
  for (const [listed, total, want] of cases) assert.equal(canReorder(listed, total), want, `${listed}/${total}`);
});
