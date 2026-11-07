// Followed-shop helpers (lib/follows.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { followControl, settleFollow, toggleFollow } from "../lib/follows.ts";

test("toggleFollow moves the count with the state, never below zero", () => {
  const cases = [
    { from: { following: false, count: 3 }, to: true, want: { following: true, count: 4 } },
    { from: { following: true, count: 4 }, to: false, want: { following: false, count: 3 } },
    { from: { following: true, count: 4 }, to: true, want: { following: true, count: 4 } },
    { from: { following: false, count: 0 }, to: false, want: { following: false, count: 0 } },
    { from: { following: true, count: 0 }, to: false, want: { following: false, count: 0 } },
  ];
  for (const c of cases) assert.deepEqual(toggleFollow(c.from, c.to), c.want, JSON.stringify(c));
});

test("settleFollow prefers the API's answer, keeps the guess on null", () => {
  const guess = { following: true, count: 5 };
  assert.deepEqual(settleFollow(guess, { isFollowed: true, followerCount: 9 }), { following: true, count: 9 });
  assert.deepEqual(settleFollow(guess, { isFollowed: false, followerCount: 4 }), { following: false, count: 4 });
  assert.equal(settleFollow(guess, null), guess);
});

test("followControl: login when signed out, count only for the owner", () => {
  const cases = [
    { status: "loading", viewerShop: null, want: "none" },
    { status: "anonymous", viewerShop: null, want: "login" },
    { status: "authenticated", viewerShop: null, want: "toggle" },
    { status: "authenticated", viewerShop: undefined, want: "toggle" },
    { status: "authenticated", viewerShop: "other", want: "toggle" },
    { status: "authenticated", viewerShop: "s1", want: "owner" },
  ];
  for (const c of cases) assert.equal(followControl(c.status, c.viewerShop, "s1"), c.want, JSON.stringify(c));
});

test("followed-shop list paging reuses the saved-list helpers with FOLLOWED_PAGE", async () => {
  const { FOLLOWED_PAGE } = await import("../lib/follows.ts");
  const { appendSaved, hasMoreSaved, withoutSaved } = await import("../lib/saved.ts");
  const cases = [
    { shown: FOLLOWED_PAGE, total: FOLLOWED_PAGE + 1, last: FOLLOWED_PAGE, want: true },
    { shown: FOLLOWED_PAGE, total: FOLLOWED_PAGE, last: FOLLOWED_PAGE, want: false },
    { shown: 5, total: 9, last: 5, want: false }, // short page = end, even with a stale total
  ];
  for (const c of cases) assert.equal(hasMoreSaved(c.shown, c.total, c.last, FOLLOWED_PAGE), c.want, JSON.stringify(c));
  const shops = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(appendSaved(shops, [{ id: "b" }, { id: "c" }]).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(withoutSaved({ total: 2, nodes: shops }, "a"), { total: 1, nodes: [{ id: "b" }] });
});
