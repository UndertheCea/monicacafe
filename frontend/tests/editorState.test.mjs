// Coffee editor state updates (lib/dashboard/editorState.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { afterReload, mergeCoffeeFields, replaceVariant } from "../lib/dashboard/editorState.ts";

const ready = (variants, extra = {}) => ({ state: "ready", coffee: { id: "c", name: "Kenya", variants, ...extra } });

test("two row saves finishing in turn keep both answers", () => {
  const start = ready([
    { id: "a", stock: 10 },
    { id: "b", stock: 5 },
  ]);
  const afterA = replaceVariant(start, { id: "a", stock: 8 });
  const afterB = replaceVariant(afterA, { id: "b", stock: 4 });
  assert.deepEqual(afterB.coffee.variants, [
    { id: "a", stock: 8 },
    { id: "b", stock: 4 },
  ]);
  assert.equal(start.coffee.variants[0].stock, 10, "input not mutated");
});

test("updates leave non-ready states alone", () => {
  for (const s of [{ state: "loading" }, { state: "missing" }, { state: "error" }]) {
    assert.equal(replaceVariant(s, { id: "a" }), s);
    assert.equal(mergeCoffeeFields(s, { name: "x" }), s);
  }
});

test("mergeCoffeeFields keeps the current options", () => {
  const cur = replaceVariant(ready([{ id: "a", stock: 10 }]), { id: "a", stock: 8 });
  const next = mergeCoffeeFields(cur, { name: "New" });
  assert.equal(next.coffee.name, "New");
  assert.equal(next.coffee.variants[0].stock, 8);
});

test("afterReload only lets the first load fail the page", () => {
  const cur = ready([]);
  assert.equal(afterReload(cur, { state: "error" }), cur);
  assert.deepEqual(afterReload({ state: "loading" }, { state: "error" }), { state: "error" });
  const fresh = ready([{ id: "a" }]);
  assert.equal(afterReload(cur, fresh), fresh);
  assert.deepEqual(afterReload(cur, { state: "missing" }), { state: "missing" });
});
