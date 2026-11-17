// "Load more" with removals in flight (lib/loadMore.ts, #338). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LOAD_MORE_RETRIES, loadMoreOffset, loadMoreStale, mergeLoaded } from "../lib/loadMore.ts";

const n = (...ids) => ids.map((id) => ({ id }));

test("loadMoreOffset subtracts rows removed since the load started", () => {
  const cases = [
    { shown: 12, start: 0, now: 0, want: 12 },
    { shown: 12, start: 3, now: 3, want: 12 }, // removals before the load are already out of `shown`
    { shown: 12, start: 3, now: 5, want: 10 },
    { shown: 1, start: 0, now: 4, want: 0 }, // never negative
  ];
  for (const c of cases) assert.equal(loadMoreOffset(c.shown, c.start, c.now), c.want, JSON.stringify(c));
});

test("loadMoreStale retries only when a removal overtook the fetch, a bounded number of times", () => {
  assert.equal(loadMoreStale(2, 2, 0), false);
  assert.equal(loadMoreStale(2, 3, 0), true);
  assert.equal(loadMoreStale(2, 3, LOAD_MORE_RETRIES - 1), true);
  assert.equal(loadMoreStale(2, 3, LOAD_MORE_RETRIES), false);
});

test("mergeLoaded appends to the current list and keeps removed rows out", () => {
  const cases = [
    {
      name: "plain append",
      current: { total: 4, nodes: n("a", "b") },
      page: { total: 4, nodes: n("c", "d") },
      removed: [],
      want: { total: 4, nodes: n("a", "b", "c", "d") },
    },
    {
      name: "row removed while loading isn't brought back (current already lacks it)",
      current: { total: 3, nodes: n("a", "c") },
      page: { total: 3, nodes: n("d") },
      removed: ["b"],
      want: { total: 3, nodes: n("a", "c", "d") },
    },
    {
      name: "a page read before the removal still holds the removed row: dropped, total corrected",
      current: { total: 3, nodes: n("a") },
      page: { total: 4, nodes: n("b", "c") },
      removed: ["b"],
      want: { total: 3, nodes: n("a", "c") },
    },
    {
      name: "ids already shown are skipped",
      current: { total: 3, nodes: n("a", "b") },
      page: { total: 3, nodes: n("b", "c") },
      removed: [],
      want: { total: 3, nodes: n("a", "b", "c") },
    },
    {
      name: "total never below the rows shown",
      current: { total: 2, nodes: n("a", "b") },
      page: { total: 1, nodes: n("c") },
      removed: [],
      want: { total: 3, nodes: n("a", "b", "c") },
    },
  ];
  for (const c of cases) assert.deepEqual(mergeLoaded(c.current, c.page, new Set(c.removed)), c.want, c.name);
});
