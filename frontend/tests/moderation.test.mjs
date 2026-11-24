// Moderation helpers (lib/moderation.ts, #225). Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { API_ERROR_CODES } from "../lib/errors.ts";
import { t } from "../lib/i18n/dict.ts";
import {
  AUDIT_ACTIONS,
  CONTACT_INFO_CODE,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  adminErrorKey,
  appendRows,
  auditActionKey,
  auditTargetKey,
  canReport,
  canSubmitReport,
  isAdminViewer,
  isContactInfoError,
  mergeAdminPage,
  nextReloadVersion,
  adminListKey,
  moderationReasonProblem,
  reportErrorKey,
  reportTargetHref,
  withUpdatedRow,
  withoutRow,
  withoutTarget,
} from "../lib/moderation.ts";

const root = new URL("..", import.meta.url).pathname;

test("mergeAdminPage: appends a current load-more page, drops one from an older search", () => {
  const cur = { state: "ready", total: 2, nodes: [{ id: "a" }, { id: "b" }] };
  const page = { total: 9, nodes: [{ id: "b" }, { id: "c" }] };
  assert.deepEqual(mergeAdminPage(cur, page, 3, 3), { state: "ready", total: 9, nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] });
  assert.equal(mergeAdminPage(cur, page, 2, 3), cur, "stale generation leaves the list alone");
  const loading = { state: "loading" };
  assert.equal(mergeAdminPage(loading, page, 3, 3), loading);
  const error = { state: "error" };
  assert.equal(mergeAdminPage(error, page, 3, 3), error);
});

test("the contact-info code is one the backend sends", () => {
  assert.ok(API_ERROR_CODES.includes(CONTACT_INFO_CODE));
  assert.equal(isContactInfoError("CONTACT_INFO_NOT_ALLOWED"), true);
  for (const c of ["BAD_USER_INPUT", "RATE_LIMITED", "", undefined]) assert.equal(isContactInfoError(c), false, String(c));
});

test("report reasons and audit actions match the GraphQL schema's enums", () => {
  let schema;
  try {
    schema = readFileSync(new URL("../../backend/graph/schema.graphqls", import.meta.url), "utf8");
  } catch {
    return; // frontend-only checkout
  }
  const enumValues = (name) =>
    schema
      .match(new RegExp(`enum ${name} \\{([^}]*)\\}`))[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  assert.deepEqual([...REPORT_REASONS], enumValues("ReportReason"));
  assert.deepEqual([...AUDIT_ACTIONS], enumValues("AuditAction"));
});

test("canSubmitReport needs a known reason and a note within the limit", () => {
  const cases = [
    ["no reason", null, "", false],
    ["unknown reason", "BORING", "", false],
    ["reason, no note", "SPAM", "", true],
    ["reason and note", "OTHER", "賣家留了 LINE", true],
    ["note at the limit", "OTHER", "字".repeat(REPORT_NOTE_MAX), true],
    ["note over the limit", "OTHER", "字".repeat(REPORT_NOTE_MAX + 1), false],
    ["surrounding spaces don't count", "OTHER", `  ${"a".repeat(REPORT_NOTE_MAX)}  `, true],
  ];
  for (const [name, reason, note, want] of cases) assert.equal(canSubmitReport(reason, note), want, name);
});

test("reportErrorKey", () => {
  const cases = [
    ["UNAUTHENTICATED", "report.error.signIn"],
    ["NOT_FOUND", "report.error.gone"],
    ["BAD_USER_INPUT", "report.error.generic"],
    ["UNAVAILABLE", "report.error.generic"],
  ];
  for (const [code, want] of cases) assert.equal(reportErrorKey(code), want, code);
});

test("canReport: signed in, and not your own comment or shop", () => {
  const me = { id: "u1", shopId: "s1" };
  const cases = [
    ["signed out", null, { authorId: "u2" }, false],
    ["someone else's comment", me, { authorId: "u2" }, true],
    ["own comment", me, { authorId: "u1" }, false],
    ["someone else's shop", me, { shopId: "s2" }, true],
    ["own shop", me, { shopId: "s1" }, false],
    ["a buyer without a shop", { id: "u3", shopId: null }, { shopId: "s1" }, true],
  ];
  for (const [name, viewer, target, want] of cases) assert.equal(canReport(viewer, target), want, name);
});

test("isAdminViewer", () => {
  assert.equal(isAdminViewer({ role: "ADMIN" }), true);
  assert.equal(isAdminViewer({ role: "SELLER" }), false);
  assert.equal(isAdminViewer(null), false);
  assert.equal(isAdminViewer(undefined), false);
});

test("moderationReasonProblem", () => {
  const cases = [
    ["blank, required", "   ", true, "required"],
    ["blank, optional", "", false, null],
    ["fine", "spam", true, null],
    ["at the limit", "字".repeat(500), true, null],
    ["too long", "字".repeat(501), true, "tooLong"],
    ["too long, optional", "a".repeat(501), false, "tooLong"],
  ];
  for (const [name, reason, required, want] of cases) assert.equal(moderationReasonProblem(reason, required), want, name);
});

test("adminErrorKey", () => {
  const cases = [
    ["FORBIDDEN", "admin.error.forbidden"],
    ["UNAUTHENTICATED", "admin.error.forbidden"],
    ["BAD_USER_INPUT", "admin.error.state"],
    ["NOT_FOUND", "admin.error.gone"],
    ["INTERNAL_SERVER_ERROR", "admin.error.generic"],
  ];
  for (const [code, want] of cases) assert.equal(adminErrorKey(code), want, code);
});

test("reportTargetHref links to the public page, or nowhere once deleted", () => {
  const none = { comment: null, shop: null, coffee: null };
  const cases = [
    ["comment", { ...none, targetType: "COMMENT", comment: { coffee: { id: "c1" } } }, "/coffees/c1"],
    ["comment on a hidden coffee", { ...none, targetType: "COMMENT", comment: { coffee: null } }, null],
    ["deleted comment", { ...none, targetType: "COMMENT" }, null],
    ["coffee", { ...none, targetType: "COFFEE", coffee: { id: "c 2" } }, "/coffees/c%202"],
    ["shop", { ...none, targetType: "SHOP", shop: { slug: "mountain-roast" } }, "/shops/mountain-roast"],
    ["deleted shop", { ...none, targetType: "SHOP" }, null],
  ];
  for (const [name, r, want] of cases) assert.equal(reportTargetHref(r), want, name);
});

test("withoutTarget drops every open report on the resolved target", () => {
  const rows = [
    { id: "r1", targetType: "COMMENT", targetId: "x" },
    { id: "r2", targetType: "SHOP", targetId: "x" },
    { id: "r3", targetType: "COMMENT", targetId: "x" },
    { id: "r4", targetType: "COMMENT", targetId: "y" },
  ];
  const got = withoutTarget({ total: 10, nodes: rows }, { targetType: "COMMENT", targetId: "x" });
  assert.deepEqual(got.nodes.map((r) => r.id), ["r2", "r4"]);
  assert.equal(got.total, 8);
  assert.equal(withoutTarget({ total: 0, nodes: rows }, rows[0]).total, 0, "never below zero");
  // #336: the API also closed reports on pages not loaded yet.
  const cases = [
    ["closedCount includes unloaded reports", 4, 6],
    ["closedCount null: rows shown", null, 8],
    ["closedCount undefined: rows shown", undefined, 8],
    ["closedCount below rows shown (stale list): rows shown", 1, 8],
  ];
  for (const [name, closed, want] of cases) {
    assert.equal(withoutTarget({ total: 10, nodes: rows }, { targetType: "COMMENT", targetId: "x" }, closed).total, want, name);
  }
  assert.equal(withoutTarget({ total: 3, nodes: rows }, rows[0], 9).total, 0, "never below zero with closedCount");
});

test("appendRows skips ids already shown; withUpdatedRow replaces one row", () => {
  assert.deepEqual(appendRows([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((r) => r.id), ["a", "b", "c"]);
  const page = { total: 2, nodes: [{ id: "a", suspended: false }, { id: "b", suspended: false }] };
  assert.deepEqual(withUpdatedRow(page, { id: "b", suspended: true }), {
    total: 2,
    nodes: [{ id: "a", suspended: false }, { id: "b", suspended: true }],
  });
});

test("audit and target labels exist in both languages; unknown values have none", () => {
  for (const a of AUDIT_ACTIONS) {
    const key = auditActionKey(a);
    for (const locale of ["zh-TW", "en"]) assert.notEqual(t(locale, key), key, `${locale} ${key}`);
  }
  assert.equal(auditActionKey("SOMETHING_NEW"), null);
  for (const type of ["USER", "SHOP", "COFFEE", "COMMENT"]) assert.equal(auditTargetKey(type), `admin.target.${type}`);
  assert.equal(auditTargetKey("ORDER"), null);
  for (const r of REPORT_REASONS) {
    for (const locale of ["zh-TW", "en"]) assert.notEqual(t(locale, `report.reason.${r}`), `report.reason.${r}`);
  }
});

test("the comment form and both description fields show the contact hint", () => {
  for (const f of [
    "components/coffees/CommentForm.tsx",
    "components/coffees/CommentBody.tsx",
    "components/dashboard/CreateShopForm.tsx",
    "components/dashboard/ShopProfileForm.tsx",
    "components/dashboard/NewCoffeeForm.tsx",
    "components/dashboard/CoffeeDetailsForm.tsx",
  ]) {
    const src = readFileSync(root + f, "utf8");
    assert.match(src, /hint=\{t\(locale, "contact\.hint"\)\}/, `${f} shows the hint`);
    assert.match(src, /isContactInfoError\(/, `${f} shows the contact error`);
  }
});

test("the report action is on comments, shop pages and published coffee pages", () => {
  assert.match(readFileSync(root + "components/coffees/CommentItem.tsx", "utf8"), /<ReportButton targetType="COMMENT"/);
  assert.match(readFileSync(root + "app/shops/[slug]/page.tsx", "utf8"), /<ReportButton targetType="SHOP"/);
  assert.match(readFileSync(root + "components/coffees/CoffeeDetailView.tsx", "utf8"), /isPublished && \([\s\S]*<ReportButton targetType="COFFEE"/);
});

test("/admin is noindex and disallowed for crawlers", () => {
  assert.match(readFileSync(root + "app/admin/page.tsx", "utf8"), /robots: \{ index: false/);
  assert.match(readFileSync(root + "app/robots.ts", "utf8"), /"\/admin"/);
});

test("nextReloadVersion: each moderation action yields a new version so the audit log reloads (#370)", () => {
  assert.equal(nextReloadVersion(0), 1);
  assert.notEqual(nextReloadVersion(4), 4);
  const src = readFileSync(new URL("../components/admin/AdminScreen.tsx", import.meta.url), "utf8");
  assert.equal(src.match(/onModerated\(\);/g)?.length, 4, "reports, users, shops and taken-down coffees each report a successful action");
});

test("adminListKey: a re-submitted search or any moderation action reloads users / shops (#450)", () => {
  const cases = [
    { a: [0, 0], b: [1, 0], same: false, why: "search re-submitted" },
    { a: [0, 0], b: [0, 1], same: false, why: "moderation action elsewhere" },
    { a: [1, 0], b: [0, 1], same: false, why: "no collision between the two counters" },
    { a: [2, 3], b: [2, 3], same: true, why: "nothing changed" },
  ];
  for (const c of cases) {
    assert.equal(adminListKey(...c.a) === adminListKey(...c.b), c.same, c.why);
  }
  const src = readFileSync(new URL("../components/admin/AdminScreen.tsx", import.meta.url), "utf8");
  assert.equal(src.match(/version=\{auditVersion\}/g)?.length, 5, "reports, users, shops, taken-down coffees and the audit log reload after an action");
});

test("withoutRow drops a restored coffee and counts it only if shown (#497)", () => {
  const page = { total: 25, nodes: [{ id: "a" }, { id: "b" }] };
  assert.deepEqual(withoutRow(page, "a"), { total: 24, nodes: [{ id: "b" }] });
  assert.deepEqual(withoutRow(page, "z"), page); // not on this page: nothing changes
  assert.deepEqual(withoutRow({ total: 0, nodes: [{ id: "a" }] }, "a"), { total: 0, nodes: [] });
});
