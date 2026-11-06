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
