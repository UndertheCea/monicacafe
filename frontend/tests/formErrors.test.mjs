// Per-field form errors (lib/formErrors.ts, #232). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fieldDomId,
  firstInvalid,
  formFieldFor,
  hasErrors,
  noErrors,
  placeError,
  scrollBehavior,
} from "../lib/formErrors.ts";

const FIELDS = ["name", "price", "stock"];
const ALIASES = { priceTwd: "price" };

test("formFieldFor: own names, dotted paths, aliases, unknown", () => {
  const cases = [
    [undefined, undefined],
    ["", undefined],
    ["name", "name"],
    ["input.name", "name"],
    ["priceTwd", "price"],
    ["input.priceTwd", "price"],
    ["stock", "stock"],
    ["slug", undefined],
    ["input.slug", undefined],
  ];
  for (const [api, want] of cases) assert.equal(formFieldFor(api, FIELDS, ALIASES), want, String(api));
});

test("placeError: under the field when the form has it, else in the summary", () => {
  const m = { key: "cf.error.price" };
  assert.deepEqual(placeError("priceTwd", m, FIELDS, ALIASES), { fields: { price: m } });
  assert.deepEqual(placeError("name", m, FIELDS), { fields: { name: m } });
  assert.deepEqual(placeError(undefined, m, FIELDS), { fields: {}, form: m });
  assert.deepEqual(placeError("unknown", m, FIELDS), { fields: {}, form: m });
});

test("firstInvalid follows the form's order, not the errors' insertion order", () => {
  const m = { key: "x" };
  assert.equal(firstInvalid(FIELDS, { fields: { stock: m, name: m } }), "name");
  assert.equal(firstInvalid(FIELDS, { fields: { stock: m } }), "stock");
  assert.equal(firstInvalid(FIELDS, { fields: {}, form: m }), undefined);
  assert.equal(firstInvalid(FIELDS, { fields: { name: undefined, price: m } }), "price");
});

test("hasErrors / noErrors", () => {
  assert.equal(hasErrors(noErrors()), false);
  assert.equal(hasErrors({ fields: { name: undefined } }), false);
  assert.equal(hasErrors({ fields: { name: { key: "x" } } }), true);
  assert.equal(hasErrors({ fields: {}, form: { key: "x" } }), true);
});

test("fieldDomId and scrollBehavior", () => {
  assert.equal(fieldDomId("auth-login", "email"), "auth-login-email");
  assert.equal(scrollBehavior(true), "auto");
  assert.equal(scrollBehavior(false), "smooth");
});
