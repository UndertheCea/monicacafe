// Comment paging helpers (lib/comments.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMENTS_PAGE, COMMENT_LIST_PAGE, appendComments, commentCoffeeHref, hasMoreComments } from "../lib/comments.ts";

test("appendComments keeps order and drops ids already shown", () => {
  const cases = [
    ["empty page", ["a", "b"], [], ["a", "b"]],
    ["next page", ["a", "b"], ["c", "d"], ["a", "b", "c", "d"]],
    ["shifted by a new comment", ["a", "b"], ["b", "c"], ["a", "b", "c"]],
    ["nothing shown yet", [], ["a"], ["a"]],
  ];
  for (const [name, shown, page, want] of cases) {
    const got = appendComments(shown.map((id) => ({ id })), page.map((id) => ({ id })));
    assert.deepEqual(got.map((c) => c.id), want, name);
  }
});

test("hasMoreComments: more to fetch only while short of the total and the last page was full", () => {
  const cases = [
    ["all shown", COMMENTS_PAGE, COMMENTS_PAGE, COMMENTS_PAGE, false],
    ["more on the server", COMMENTS_PAGE, COMMENTS_PAGE + 1, COMMENTS_PAGE, true],
    ["short last page ends it (stale total)", COMMENTS_PAGE + 3, COMMENTS_PAGE + 9, 3, false],
    ["no comments", 0, 0, 0, false],
  ];
  for (const [name, shown, total, last, want] of cases) {
    assert.equal(hasMoreComments(shown, total, last), want, name);
  }
});

test("hasMoreComments takes the list's own page size", () => {
  assert.equal(hasMoreComments(COMMENT_LIST_PAGE, 15, COMMENT_LIST_PAGE, COMMENT_LIST_PAGE), true);
  assert.equal(hasMoreComments(COMMENT_LIST_PAGE, 15, COMMENT_LIST_PAGE), false, "default page size is COMMENTS_PAGE");
  assert.equal(hasMoreComments(15, 15, 5, COMMENT_LIST_PAGE), false);
});

test("commentCoffeeHref links published coffees publicly and drafts to the preview", () => {
  assert.equal(commentCoffeeHref({ id: "abc", isPublished: true }), "/coffees/abc");
  assert.equal(commentCoffeeHref({ id: "abc", isPublished: false }), "/dashboard/coffees/abc/preview");
  assert.equal(commentCoffeeHref({ id: "a/b?c", isPublished: true }), "/coffees/a%2Fb%3Fc");
  assert.equal(commentCoffeeHref(null), null);
  assert.equal(commentCoffeeHref(undefined), null);
});
