// "Load more" count kept in history.state (lib/comments.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadedComments, withLoadedComments } from "../lib/comments.ts";

test("loadedComments / withLoadedComments keep the count in history.state without losing Next's keys", () => {
  const next = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [1] };
  const s1 = withLoadedComments(next, "c1", 40);
  assert.equal(s1.__NA, true);
  assert.deepEqual(s1.__PRIVATE_NEXTJS_INTERNALS_TREE, [1]);
  assert.equal(loadedComments(s1, "c1"), 40);
  assert.equal(loadedComments(s1, "c2"), 0);
  const s2 = withLoadedComments(s1, "c2", 20);
  assert.equal(loadedComments(s2, "c1"), 40);
  assert.equal(loadedComments(s2, "c2"), 20);
  const bad = [null, undefined, "x", 3, {}, { moniLoadedComments: null }, { moniLoadedComments: { c1: "9" } }, { moniLoadedComments: { c1: -1 } }];
  for (const b of bad) assert.equal(loadedComments(b, "c1"), 0);
  assert.deepEqual(withLoadedComments(null, "c1", 5), { moniLoadedComments: { c1: 5 } });
});
