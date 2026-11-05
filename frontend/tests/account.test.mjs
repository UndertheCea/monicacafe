// /account form helpers (lib/auth/account.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanDisplayName, passwordChangeProblem, passwordErrorKey } from "../lib/auth/account.ts";

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
