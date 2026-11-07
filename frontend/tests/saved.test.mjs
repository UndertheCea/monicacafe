// Saved-coffee helpers (lib/saved.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SAVED_PAGE, appendSaved, hasMoreSaved, settleSave, toggleSave, withoutSaved } from "../lib/saved.ts";

test("toggleSave moves the count with the state, never below zero", () => {
  const cases = [
    { from: { saved: false, count: 3 }, to: true, want: { saved: true, count: 4 } },
    { from: { saved: true, count: 4 }, to: false, want: { saved: false, count: 3 } },
    { from: { saved: true, count: 4 }, to: true, want: { saved: true, count: 4 } },
    { from: { saved: false, count: 0 }, to: false, want: { saved: false, count: 0 } },
    // a stale server-rendered count of 0 while the viewer had saved it
    { from: { saved: true, count: 0 }, to: false, want: { saved: false, count: 0 } },
  ];
  for (const c of cases) assert.deepEqual(toggleSave(c.from, c.to), c.want, JSON.stringify(c));
});

test("settleSave prefers the API's answer, keeps the guess on null", () => {
  const guess = { saved: true, count: 5 };
  assert.deepEqual(settleSave(guess, { isSaved: true, saveCount: 9 }), { saved: true, count: 9 });
  assert.deepEqual(settleSave(guess, null), guess);
});

test("appendSaved drops ids already shown", () => {
  const shown = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(appendSaved(shown, [{ id: "b" }, { id: "c" }]), [{ id: "a" }, { id: "b" }, { id: "c" }]);
  assert.deepEqual(appendSaved([], []), []);
});

test("withoutSaved removes the row and lowers the total only when it was there", () => {
  const list = { total: 5, nodes: [{ id: "a" }, { id: "b" }] };
  assert.deepEqual(withoutSaved(list, "a"), { total: 4, nodes: [{ id: "b" }] });
  assert.deepEqual(withoutSaved(list, "zz"), list);
  assert.deepEqual(withoutSaved({ total: 0, nodes: [{ id: "a" }] }, "a"), { total: 0, nodes: [] });
  assert.ok(SAVED_PAGE > 0);
});

test("hasMoreSaved needs a full last page and fewer shown than the total", () => {
  const cases = [
    [SAVED_PAGE, 30, SAVED_PAGE, true],
    [SAVED_PAGE, SAVED_PAGE, SAVED_PAGE, false],
    [5, 30, 5, false], // short page: the end, whatever the stale total says
    [0, 0, 0, false],
  ];
  for (const [shown, total, last, want] of cases) assert.equal(hasMoreSaved(shown, total, last), want);
});
