// Retry helpers (lib/retry.ts, #437). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { nextLoadKey, submitSearch } from "../lib/retry.ts";
import { t } from "../lib/i18n/dict.ts";

test("nextLoadKey advances every time", () => {
  for (const [from, to] of [[0, 1], [1, 2], [41, 42]]) assert.equal(nextLoadKey(from), to);
});

test("submitSearch refetches even for the same query", () => {
  const first = submitSearch({ query: "", key: 0 }, "abc");
  assert.deepEqual(first, { query: "abc", key: 1 });
  const again = submitSearch(first, "abc");
  assert.equal(again.query, "abc");
  assert.notEqual(again.key, first.key);
  assert.equal(submitSearch(again, "").query, "");
});

test("load error messages no longer tell people to refresh", () => {
  for (const key of ["cart.loadError", "admin.loadError"]) {
    assert.doesNotMatch(t("en", key), /refresh/i);
    assert.doesNotMatch(t("zh-TW", key), /重新整理/);
  }
});

test("panels wire a retry button and no submit short-circuit", () => {
  const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  for (const f of ["components/cart/CartView.tsx", "components/account/SavedCoffees.tsx", "components/CommentFeed.tsx", "components/admin/AdminScreen.tsx"]) {
    assert.match(src(f), /crash\.retry/, f);
  }
  assert.doesNotMatch(src("components/admin/AdminScreen.tsx"), /if \(q === search\) return/);
});

test("Save / Follow toggles are enabled only once the viewer's own state loaded (#443)", async () => {
  const { ownStateAfterLoad, toggleEnabled } = await import("../lib/retry.ts");
  assert.equal(ownStateAfterLoad(true), "ready");
  assert.equal(ownStateAfterLoad(false), "failed");
  for (const [load, busy, want] of [
    ["loading", false, false],
    ["failed", false, false],
    ["ready", true, false],
    ["ready", false, true],
  ]) {
    assert.equal(toggleEnabled(load, busy), want, `${load} busy=${busy}`);
  }
});
