// Comment paging helpers (lib/comments.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMENTS_PAGE,
  COMMENT_LIST_PAGE,
  COMMENT_MAX_CHARS,
  appendComments,
  canEditComment,
  commentAuthorBadge,
  commentCoffeeHref,
  commentEditErrorKey,
  deleteOutcome,
  commentInputErrorKey,
  commentEditState,
  commentLength,
  hasMoreComments,
  lastPageSize,
  pickComment,
  withEditedComment,
  withoutComment,
} from "../lib/comments.ts";

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

test("lastPageSize follows the first page until a page is fetched (#403)", () => {
  // 19 comments at mount, 2 posted, refresh: the first page is now full.
  assert.equal(lastPageSize(null, COMMENTS_PAGE - 1), COMMENTS_PAGE - 1);
  assert.equal(lastPageSize(null, COMMENTS_PAGE), COMMENTS_PAGE);
  assert.equal(hasMoreComments(COMMENTS_PAGE, COMMENTS_PAGE + 1, lastPageSize(null, COMMENTS_PAGE)), true);
  // After a fetch, that page's size decides; an empty fetch ends it.
  assert.equal(lastPageSize(3, COMMENTS_PAGE), 3);
  assert.equal(lastPageSize(0, COMMENTS_PAGE), 0);
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

test("withoutComment drops the row and its count once", () => {
  const page = { total: 12, nodes: [{ id: "a" }, { id: "b" }] };
  assert.deepEqual(withoutComment(page, "a"), { total: 11, nodes: [{ id: "b" }] });
  assert.deepEqual(withoutComment(page, "zzz"), page, "unknown id: unchanged");
  assert.deepEqual(withoutComment({ total: 0, nodes: [{ id: "a" }] }, "a"), { total: 0, nodes: [] }, "never negative");
});

test("canEditComment: author only, published coffee only", () => {
  const cases = [
    ["u1", "u1", true, true],
    ["u1", "u1", false, false],
    ["u2", "u1", true, false],
    [null, "u1", true, false],
    [undefined, "u1", true, false],
    ["", "", true, false],
  ];
  for (const [viewer, author, published, want] of cases) {
    assert.equal(canEditComment(viewer, author, published), want, `${viewer} / ${author} / ${published}`);
  }
});

test("commentLength counts runes of the trimmed text", () => {
  assert.equal(commentLength("  好喝  "), 2);
  assert.equal(commentLength("☕️"), 2); // coffee + variation selector, as Go counts runes
  assert.equal(commentLength("   "), 0);
});

test("commentEditState gates Save", () => {
  const cases = [
    { draft: "好喝", saved: "好喝", want: { unchanged: true, canSave: false, tooLong: false } },
    { draft: " 好喝 ", saved: "好喝", want: { unchanged: true, canSave: false, tooLong: false } },
    { draft: "很好喝", saved: "好喝", want: { unchanged: false, canSave: true, tooLong: false } },
    { draft: "   ", saved: "好喝", want: { unchanged: false, canSave: false, tooLong: false } },
    { draft: "咖".repeat(COMMENT_MAX_CHARS + 1), saved: "x", want: { unchanged: false, canSave: false, tooLong: true } },
    { draft: "咖".repeat(COMMENT_MAX_CHARS), saved: "x", want: { unchanged: false, canSave: true, tooLong: false } },
  ];
  for (const { draft, saved, want } of cases) {
    const got = commentEditState(draft, saved);
    assert.deepEqual({ unchanged: got.unchanged, canSave: got.canSave, tooLong: got.tooLong }, want, draft.slice(0, 10));
  }
});

test("commentEditErrorKey maps API codes", () => {
  assert.equal(commentEditErrorKey("BAD_USER_INPUT"), "comments.tooLong");
  assert.equal(commentEditErrorKey("NOT_FOUND"), "comments.editGone");
  assert.equal(commentEditErrorKey("FORBIDDEN"), "comments.editError");
  assert.equal(commentEditErrorKey("INTERNAL"), "comments.editError");
});

test("withEditedComment replaces one row's text and keeps the rest", () => {
  const page = {
    total: 5,
    nodes: [
      { id: "a", body: "one", editedAt: null, user: { id: "u" } },
      { id: "b", body: "two", editedAt: null, user: { id: "u" } },
    ],
  };
  const got = withEditedComment(page, { id: "b", body: "TWO", editedAt: "2026-11-07T00:00:00Z" });
  assert.equal(got.total, 5);
  assert.deepEqual(got.nodes[1], { id: "b", body: "TWO", editedAt: "2026-11-07T00:00:00Z", user: { id: "u" } });
  assert.equal(got.nodes[0], page.nodes[0], "other rows untouched");
  assert.equal(page.nodes[1].body, "two", "input not mutated");
  assert.deepEqual(withEditedComment(page, { id: "zzz", body: "x", editedAt: null }).nodes, page.nodes);
});

test("commentAuthorBadge marks only the shop owner's comments", () => {
  const cases = [
    ["shop owner", { fromShop: true }, "comments.fromShop"],
    ["buyer", { fromShop: false }, null],
    ["field not fetched", {}, null],
    ["null", { fromShop: null }, null],
  ];
  for (const [name, c, want] of cases) assert.equal(commentAuthorBadge(c), want, name);
});

test("commentInputErrorKey: too long only when it is, else refused characters (#328)", () => {
  const cases = [
    ["a".repeat(501), "comments.tooLong"],
    ["咖".repeat(501), "comments.tooLong"],
    ["a".repeat(500), "comments.badChars"],
    ["好喝\u200b", "comments.badChars"],
    ["  " + "a".repeat(500) + "  ", "comments.badChars"],
  ];
  for (const [body, want] of cases) assert.equal(commentInputErrorKey(body), want, JSON.stringify(body.slice(0, 8)));
  assert.equal(commentInputErrorKey("abc", 2), "comments.tooLong");
});

test("deleteOutcome", () => {
  const cases = [
    ["NOT_FOUND", "gone"],
    ["RATE_LIMITED", "rateLimited"],
    ["FORBIDDEN", "failed"],
    ["UNAVAILABLE", "failed"],
    ["INTERNAL_SERVER_ERROR", "failed"],
  ];
  for (const [code, want] of cases) assert.equal(deleteOutcome(code), want, code);
});

test("pickComment keeps the local edit only while it is at least as new as the props", () => {
  const c = (id, body, editedAt) => ({ id, body, editedAt });
  const cases = [
    ["no local copy", c("a", "p", null), null, "p"],
    ["other comment's local copy", c("a", "p", "2026-01-02T00:00:00Z"), c("b", "l", "2026-01-03T00:00:00Z"), "p"],
    ["props not edited yet", c("a", "p", null), c("a", "l", "2026-01-02T00:00:00Z"), "l"],
    ["same time", c("a", "p", "2026-01-02T00:00:00Z"), c("a", "l", "2026-01-02T00:00:00Z"), "l"],
    ["local newer", c("a", "p", "2026-01-02T00:00:00Z"), c("a", "l", "2026-01-03T00:00:00Z"), "l"],
    ["props newer", c("a", "p", "2026-01-04T00:00:00Z"), c("a", "l", "2026-01-03T00:00:00Z"), "p"],
    ["local never edited, props edited", c("a", "p", "2026-01-04T00:00:00Z"), c("a", "l", null), "p"],
    ["both null", c("a", "p", null), c("a", "l", null), "l"],
  ];
  for (const [name, props, local, body] of cases) assert.equal(pickComment(props, local).body, body, name);
});
