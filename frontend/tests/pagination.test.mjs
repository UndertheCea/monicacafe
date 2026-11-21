// Pager shortcuts (lib/pagination.ts) and the post-register greeting (lib/welcome.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { beyondEnd, clampPage, MAX_PAGE, pagerShortcuts, pastLastPage, showPager } from "../lib/pagination.ts";
import { WELCOME_KEY, rememberWelcome, takeWelcome } from "../lib/welcome.ts";

test("pagerShortcuts shows first / last only past 3 pages and only when prev / next doesn't reach them", () => {
  const cases = [
    ["3 pages: none", 2, 3, null, null],
    ["4 pages, first page", 1, 4, null, 4],
    ["4 pages, page 2", 2, 4, null, 4],
    ["4 pages, page 3", 3, 4, 1, null],
    ["7 pages, middle", 4, 7, 1, 7],
    ["7 pages, last", 7, 7, 1, null],
    ["7 pages, second last", 6, 7, 1, null],
  ];
  for (const [name, page, pages, first, last] of cases) {
    assert.deepEqual(pagerShortcuts(page, pages), { first, last }, name);
  }
});

function memory() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

test("the welcome name is remembered once and cleared when read", () => {
  const s = memory();
  assert.equal(takeWelcome(s), null);
  rememberWelcome(s, "  Mei  ");
  assert.equal(s.getItem(WELCOME_KEY), "Mei");
  assert.equal(takeWelcome(s), "Mei");
  assert.equal(takeWelcome(s), null);
  rememberWelcome(s, "   ");
  assert.equal(takeWelcome(s), null);
  assert.equal(takeWelcome(undefined), null);
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {},
  };
  rememberWelcome(broken, "Mei");
  assert.equal(takeWelcome(broken), null);
});

test("pastLastPage is true only for a page beyond the last one of a non-empty list", () => {
  const cases = [
    ["empty list, page 1", 0, 1, 12, false],
    ["empty list, page 3", 0, 3, 12, false],
    ["12 items, page 1", 12, 1, 12, false],
    ["12 items, page 2", 12, 2, 12, true],
    ["12 items, page 3", 12, 3, 12, true],
    ["13 items, exactly-full page 1", 13, 1, 12, false],
    ["13 items, last partial page", 13, 2, 12, false],
    ["24 items, exactly-full last page", 24, 2, 12, false],
    ["24 items, one past", 24, 3, 12, true],
  ];
  for (const [name, total, page, size, want] of cases) {
    assert.equal(pastLastPage(total, page, size), want, name);
  }
});

test("beyondEnd also flags page 2+ of an empty list (#461)", () => {
  const cases = [
    ["empty list, page 1", 0, 1, 12, false],
    ["empty list, page 2", 0, 2, 12, true],
    ["12 items, page 2", 12, 2, 12, true],
    ["13 items, page 2", 13, 2, 12, false],
  ];
  for (const [name, total, page, size, want] of cases) {
    assert.equal(beyondEnd(total, page, size), want, name);
  }
});

test("clampPage keeps ?page= between 1 and MAX_PAGE (#399)", () => {
  const cases = [
    [Number.NaN, 1],
    [0, 1],
    [-3, 1],
    [1, 1],
    [7, 7],
    [2.9, 2],
    [MAX_PAGE, MAX_PAGE],
    [1e20, MAX_PAGE],
    [Number.POSITIVE_INFINITY, 1],
  ];
  for (const [n, want] of cases) assert.equal(clampPage(n), want, String(n));
  // The largest offset any listing asks for stays inside GraphQL's 32-bit Int.
  assert.ok((MAX_PAGE - 1) * 100 < 2 ** 31);
});

test("showPager hides the pager on single pages and past the last page (#399)", () => {
  const cases = [
    [1, 1, false],
    [1, 0, false],
    [1, 3, true],
    [3, 3, true],
    [4, 3, false],
    [50, 3, false],
  ];
  for (const [page, pages, want] of cases) assert.equal(showPager(page, pages), want, `${page} of ${pages}`);
});
