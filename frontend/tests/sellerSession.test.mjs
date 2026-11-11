// #228: seller forms survive session loss, warn before leaving, and keep a draft. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftKey,
  isEmptyDraft,
  makeDraft,
  parseDraft,
  sellerSessionView,
  shouldConfirmLeave,
} from "../lib/dashboard/session.ts";

test("sellerSessionView keeps a form that had a session", () => {
  const cases = [
    ["loading", false, "loading"],
    ["authenticated", false, "open"],
    ["authenticated", true, "open"],
    ["anonymous", false, "login"],
    ["anonymous", true, "locked"],
  ];
  for (const [status, had, want] of cases) assert.equal(sellerSessionView(status, had), want, `${status}/${had}`);
});

test("shouldConfirmLeave: only plain same-origin navigations to another page", () => {
  const cur = "https://moni.cafe/dashboard/coffees/new";
  const cases = [
    ["/dashboard", {}, true],
    ["/coffees?q=x", {}, true],
    ["https://moni.cafe/dashboard/coffees/new?x=1", {}, true],
    ["#notes", {}, false],
    ["/dashboard/coffees/new#notes", {}, false],
    ["https://elsewhere.example/", {}, false],
    ["/dashboard", { modified: true }, false],
    ["/dashboard", { target: "_blank" }, false],
    ["/dashboard", { target: "_self" }, true],
    ["/dashboard", { download: true }, false],
    ["http://[bad", {}, false],
  ];
  for (const [href, opts, want] of cases) assert.equal(shouldConfirmLeave(href, cur, opts), want, href + JSON.stringify(opts));
});

test("drafts: key per user, empty drafts aren't kept, malformed ones are dropped", () => {
  assert.equal(draftKey("u1"), "mc-draft:new-coffee:u1");
  const defaultRow = { grind: "WHOLE_BEAN", weightG: "200", priceTwd: "", stock: "0" };
  const blank = makeDraft([["name", ""], ["notes", " "], ["photo", { file: true }]], [defaultRow]);
  assert.deepEqual(blank.fields, { name: "", notes: " " }, "non-string entries (files) are skipped");
  assert.equal(isEmptyDraft(blank), true);
  assert.equal(parseDraft(JSON.stringify(blank)), null);

  const typed = makeDraft([["name", "耶加雪菲"], ["origin", "abc"]], [defaultRow]);
  assert.equal(isEmptyDraft(typed), false);
  assert.deepEqual(parseDraft(JSON.stringify(typed)), typed);

  const rowsOnly = makeDraft([["name", ""]], [{ ...defaultRow, priceTwd: "450" }]);
  assert.equal(isEmptyDraft(rowsOnly), false);
  assert.equal(isEmptyDraft(makeDraft([], [defaultRow, defaultRow])), false);

  for (const bad of [null, "", "{", "[]", '{"fields":[],"rows":[]}', '{"fields":{"a":1},"rows":[]}', '{"fields":{},"rows":[{"grind":1}]}']) {
    assert.equal(parseDraft(bad), null, String(bad));
  }
});
