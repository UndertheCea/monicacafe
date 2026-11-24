// /account form helpers (lib/auth/account.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountDeletionBlock,
  accountLoginRedirect,
  cleanDisplayName,
  confirmFocusTarget,
  displayNameChanged,
  deleteAccountErrorKey,
  passwordChangeProblem,
  passwordErrorKey,
} from "../lib/auth/account.ts";

test("passwordChangeProblem", () => {
  const cases = [
    { name: "ok", args: ["old-password", "new-password-1", "new-password-1"], want: null },
    { name: "no current", args: ["", "new-password-1", "new-password-1"], want: "current" },
    { name: "too short", args: ["old-password", "short", "short"], want: "password" },
    { name: "8 CJK chars is long enough", args: ["old-password", "咖啡咖啡咖啡咖啡", "咖啡咖啡咖啡咖啡"], want: null },
    { name: "over 72 bytes", args: ["old-password", "咖".repeat(25), "咖".repeat(25)], want: "password" },
    { name: "unchanged", args: ["same-password", "same-password", "same-password"], want: "same" },
    { name: "confirm differs", args: ["old-password", "new-password-1", "new-password-2"], want: "mismatch" },
  ];
  for (const c of cases) assert.equal(passwordChangeProblem(...c.args), c.want, c.name);
});

test("cleanDisplayName", () => {
  const cases = [
    ["  小明  ", "小明"],
    ["", null],
    ["   ", null],
    ["a".repeat(50), "a".repeat(50)],
    ["a".repeat(51), null],
    ["☕".repeat(50), "☕".repeat(50)],
  ];
  for (const [in_, want] of cases) assert.equal(cleanDisplayName(in_), want, in_);
});

test("passwordErrorKey", () => {
  const cases = [
    [["BAD_USER_INPUT", "currentPassword"], "account.error.current"],
    [["BAD_USER_INPUT", "newPassword"], "auth.error.password"],
    [["UNAVAILABLE"], "auth.error.unavailable"],
    [["INTERNAL_SERVER_ERROR"], "account.error.generic"],
  ];
  for (const [args, want] of cases) assert.equal(passwordErrorKey(...args), want, args.join(" "));
});

test("accountDeletionBlock: shop owners and admins can't delete here", () => {
  const cases = [
    [{ role: "BUYER", shop: null }, null],
    [{ role: "SELLER", shop: { id: "s" } }, "shop"],
    // a buyer token issued before opening a shop still has the shop on the session user
    [{ role: "BUYER", shop: { id: "s" } }, "shop"],
    [{ role: "ADMIN", shop: null }, "admin"],
    [{ role: "SELLER", shop: null }, null],
  ];
  for (const [user, want] of cases) assert.equal(accountDeletionBlock(user), want, JSON.stringify(user));
});

test("deleteAccountErrorKey maps backend errors to messages", () => {
  const cases = [
    [["BAD_USER_INPUT", "password"], "account.error.deletePassword"],
    [["BAD_USER_INPUT", "other"], "account.error.generic"],
    [["FORBIDDEN"], "account.delete.blockedShop"],
    [["UNAVAILABLE"], "auth.error.unavailable"],
    [["INTERNAL"], "account.error.generic"],
  ];
  for (const [[code, field], want] of cases) assert.equal(deleteAccountErrorKey(code, field), want);
});

test("exportFileName uses the Taipei date (#270)", async () => {
  const { exportFileName } = await import("../lib/auth/account.ts");
  assert.equal(exportFileName(new Date("2026-11-14T03:00:00Z")), "monicafe-data-2026-11-14.json");
  // 16:30 UTC is 00:30 the next day in Taipei.
  assert.equal(exportFileName(new Date("2026-11-14T16:30:00Z")), "monicafe-data-2026-11-15.json");
  assert.equal(exportFileName(new Date("2026-12-31T15:59:59Z")), "monicafe-data-2026-12-31.json");
});

test("formatExport pretty-prints and refuses non-JSON", async () => {
  const { formatExport } = await import("../lib/auth/account.ts");
  assert.equal(formatExport('{"a":[1],"b":null}'), '{\n  "a": [\n    1\n  ],\n  "b": null\n}\n');
  assert.throws(() => formatExport("<html>"));
});

test("displayNameChanged: an unchanged name needs no request (#340)", () => {
  const cases = [
    { clean: "Moni", current: "Moni", want: false },
    { clean: "Moni", current: "moni", want: true },
    { clean: "新名字", current: "舊名字", want: true },
    { clean: "Moni", current: undefined, want: true },
  ];
  for (const c of cases) assert.equal(displayNameChanged(c.clean, c.current), c.want, JSON.stringify(c));
});

test("confirmFocusTarget (#389)", () => {
  const idle = { confirming: false, busy: false };
  const open = { confirming: true, busy: false };
  const working = { confirming: true, busy: true };
  const cases = [
    { name: "opening focuses Yes", prev: idle, next: open, ret: false, want: "yes" },
    { name: "failed sign-out re-enables Yes", prev: working, next: open, ret: false, want: "yes" },
    { name: "starting the action moves nothing", prev: open, next: working, ret: false, want: null },
    { name: "cancel returns to the trigger", prev: open, next: idle, ret: true, want: "trigger" },
    { name: "failed delete returns to the trigger", prev: working, next: idle, ret: true, want: "trigger" },
    { name: "typing the password closes without moving focus", prev: open, next: idle, ret: false, want: null },
    { name: "no change", prev: idle, next: idle, ret: true, want: null },
  ];
  for (const c of cases) assert.equal(confirmFocusTarget(c.prev, c.next, c.ret), c.want, c.name);
});

test("accountLoginRedirect: a failed leave on an ended session still goes to log in (#494)", () => {
  const cases = [
    ["anonymous", false, "/login?next=%2Faccount"],
    ["anonymous", true, null], // sign out everywhere / delete running: it redirects home itself
    ["loading", false, null],
    ["authenticated", false, null],
    ["authenticated", true, null],
  ];
  for (const [status, leaving, want] of cases) {
    assert.equal(accountLoginRedirect(status, leaving), want, `${status} leaving=${leaving}`);
  }
});
