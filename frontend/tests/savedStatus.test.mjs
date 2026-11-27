// "Saved" confirmation clears on edit (lib/savedStatus.ts, #556). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { savedAfterEdit } from "../lib/savedStatus.ts";

test("savedAfterEdit", () => {
  const cases = [
    { saved: true, before: "Ana", after: "Ana B", want: false },
    { saved: true, before: true, after: false, want: false },
    { saved: true, before: "Ana", after: "Ana", want: true },
    { saved: false, before: "Ana", after: "Ana B", want: false },
    { saved: false, before: false, after: false, want: false },
  ];
  for (const c of cases) assert.equal(savedAfterEdit(c.saved, c.before, c.after), c.want, JSON.stringify(c));
});
