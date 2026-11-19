import { test } from "node:test";
import assert from "node:assert/strict";

import { rowFocusTarget } from "../lib/rowFocus.ts";

const rows = (spec) => spec.split(" ").map((s) => ({ id: s.replace("-", ""), hasAction: !s.endsWith("-") }));

test("rowFocusTarget: next row with an action, then the previous one, then the heading", () => {
  const cases = [
    [rows("a b c"), "b", { kind: "row", id: "c" }],
    [rows("a b c"), "c", { kind: "row", id: "b" }],
    [rows("a b c"), "a", { kind: "row", id: "b" }],
    [rows("a"), "a", { kind: "heading" }],
    [[], "a", { kind: "heading" }],
    // rows without an action (someone else's comment) are skipped
    [rows("a b c- d"), "b", { kind: "row", id: "d" }],
    [rows("a b c- d-"), "b", { kind: "row", id: "a" }],
    [rows("a- b c-"), "b", { kind: "heading" }],
    // unknown id: treated as the first row
    [rows("a b"), "zz", { kind: "row", id: "a" }],
  ];
  for (const [list, removed, want] of cases) assert.deepEqual(rowFocusTarget(list, removed), want, `${removed} in ${JSON.stringify(list)}`);
});
