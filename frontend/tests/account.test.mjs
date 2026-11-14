// /account form helpers (lib/auth/account.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountDeletionBlock,
  cleanDisplayName,
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
