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

test("firstPageShifted: a new comment on top after load more leaves a gap; a deletion doesn't (#475)", async () => {
  const { appendComments, firstPageShifted } = await import("../lib/comments.ts");
  const c = (i) => ({ id: `c${i}` });
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => c(a + k));
  const prev = range(1, 20);
  const extra = range(21, 40);
  const posted = [{ id: "new" }, ...range(1, 19)];
  assert.equal(firstPageShifted(prev, posted, extra), true);
  // Without the refetch the merged list skips c20.
  assert.equal(appendComments(posted, extra).some((x) => x.id === "c20"), false);
  assert.equal(firstPageShifted(prev, prev, extra), false);
  // c5 deleted: the server's first page pulls c21 up, which is already fetched.
  const deleted = [...range(1, 4), ...range(6, 21)];
  assert.equal(firstPageShifted(prev, deleted, extra), false);
  // Nothing loaded below the first page: the server page is the whole list.
  assert.equal(firstPageShifted(prev, posted, []), false);
});
