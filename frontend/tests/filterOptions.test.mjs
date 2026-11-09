// /coffees sidebar option helpers (lib/filterOptions.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByRegion, optionsWithCoffees } from "../lib/filterOptions.ts";

const opts = [
  { id: "a", coffeeCount: 3 },
  { id: "b", coffeeCount: 0 },
  { id: "c", coffeeCount: 1 },
  { id: "d", coffeeCount: 0 },
];

test("optionsWithCoffees keeps values with coffees, plus the selected one", () => {
  const cases = [
    [undefined, ["a", "c"]],
    ["", ["a", "c"]],
    ["a", ["a", "c"]],
    ["b", ["a", "b", "c"]], // selected but empty: still shown
    ["zzz", ["a", "c"]], // unknown id: nothing extra
  ];
  for (const [selected, want] of cases) {
    assert.deepEqual(
      optionsWithCoffees(opts, selected).map((o) => o.id),
      want,
      `selected=${selected}`,
    );
  }
  assert.deepEqual(optionsWithCoffees([], "a"), []);
});

test("groupByRegion keeps first-seen order and drops empty regions", () => {
  const origins = [
    { id: "et", region: "Africa", coffeeCount: 2 },
    { id: "co", region: "Americas", coffeeCount: 0 },
    { id: "ke", region: "Africa", coffeeCount: 1 },
    { id: "tw", region: "Asia", coffeeCount: 1 },
  ];
  const grouped = groupByRegion(optionsWithCoffees(origins));
  assert.deepEqual(
    grouped.map(([r, l]) => [r, l.map((o) => o.id)]),
    [
      ["Africa", ["et", "ke"]],
      ["Asia", ["tw"]],
    ],
  );
  assert.deepEqual(groupByRegion([]), []);
});
