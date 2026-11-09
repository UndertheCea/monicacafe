// Drawer helpers (lib/drawer.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DRAWER_BREAKPOINT_PX, INLINE_SIDEBAR_QUERY, isOutside } from "../lib/drawer.ts";

test("isOutside: only points beyond the panel's edges are backdrop clicks", () => {
  const box = { left: 0, top: 0, right: 320, bottom: 800 };
  const cases = [
    [10, 10, false],
    [0, 0, false],
    [320, 800, false],
    [321, 400, true],
    [600, 10, true],
    [100, 801, true],
    [-1, 5, true],
  ];
  for (const [x, y, want] of cases) assert.equal(isOutside(box, x, y), want, `${x},${y}`);
});

test("the drawer breakpoint is Tailwind's md, and FilterPanel uses md: classes", () => {
  assert.equal(DRAWER_BREAKPOINT_PX, 768);
  assert.equal(INLINE_SIDEBAR_QUERY, "(min-width: 768px)");
  const panel = readFileSync(new URL("../components/coffees/FilterPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /md:hidden/);
  assert.match(panel, /md:block/);
  assert.doesNotMatch(panel, /\blg:/, "no lg: breakpoint left in the panel");
});

test("the drawer's dim is the only tint: black at 40%, no blur or colour", () => {
  const drawer = readFileSync(new URL("../components/Drawer.tsx", import.meta.url), "utf8");
  assert.match(drawer, /backdrop:bg-black\/40/);
  assert.doesNotMatch(drawer, /backdrop-blur|\bblur-|amber-|yellow-|bg-gradient|bg-linear/);
});
