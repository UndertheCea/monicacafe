// Pager shortcuts (lib/pagination.ts) and the post-register greeting (lib/welcome.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pagerShortcuts } from "../lib/pagination.ts";
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
