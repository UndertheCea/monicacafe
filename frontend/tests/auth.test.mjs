// Pure auth helpers (lib/auth/token.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jwtExpiryMs, refreshDelayMs, safeNext, validateCredentials } from "../lib/auth/token.ts";

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

test("jwtExpiryMs", () => {
  const cases = [
    { name: "valid exp", token: jwt({ sub: "u", exp: 1_800_000_000 }), want: 1_800_000_000_000 },
    { name: "missing exp", token: jwt({ sub: "u" }), want: null },
    { name: "string exp", token: jwt({ exp: "soon" }), want: null },
    { name: "not a jwt", token: "abc", want: null },
    { name: "garbage payload", token: "a.!!!.c", want: null },
    { name: "payload not object", token: `a.${b64url(42)}.c`, want: null },
    // base64url chars (- and _) and missing padding must decode.
    { name: "url-safe alphabet", token: jwt({ exp: 1_700_000_001, n: "??>>" }), want: 1_700_000_001_000 },
  ];
  for (const c of cases) assert.equal(jwtExpiryMs(c.token), c.want, c.name);
});

test("refreshDelayMs", () => {
  const now = 1_000_000;
  const cases = [
    { name: "15 min token refreshes 1 min early", exp: now + 15 * 60_000, want: 14 * 60_000 },
    { name: "already expired → 5 s floor", exp: now - 1000, want: 5_000 },
    { name: "expires within a minute → floor", exp: now + 30_000, want: 5_000 },
    { name: "far future capped at 15 min", exp: now + 24 * 3600_000, want: 15 * 60_000 },
  ];
  for (const c of cases) assert.equal(refreshDelayMs(c.exp, now), c.want, c.name);
});

test("safeNext", () => {
  const cases = [
    [null, "/"],
    ["", "/"],
    ["/coffees/123", "/coffees/123"],
    ["/dashboard?tab=coffees", "/dashboard?tab=coffees"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["/api/auth/logout", "/"],
  ];
  for (const [input, want] of cases) assert.equal(safeNext(input), want, String(input));
  assert.equal(safeNext("nope", "/dashboard"), "/dashboard");
});

test("validateCredentials", () => {
  const cases = [
    { args: ["a@b.tw", "password1"], want: null },
    { args: ["  a@b.tw ", "password1"], want: null },
    { args: ["not-an-email", "password1"], want: "email" },
    { args: ["a@b.tw", "short"], want: "password" },
    { args: ["a@b.tw", "x".repeat(73)], want: "password" },
    // 24 CJK chars = 72 UTF-8 bytes (bcrypt's limit) is fine; 25 is not.
    { args: ["a@b.tw", "咖".repeat(24)], want: null },
    { args: ["a@b.tw", "咖".repeat(25)], want: "password" },
    { args: ["a@b.tw", null], want: null },
    { args: ["a@b.tw", "password1", "  "], want: "displayName" },
    { args: ["a@b.tw", "password1", "小明"], want: null },
    { args: ["a@b.tw", "password1", "名".repeat(51)], want: "displayName" },
  ];
  for (const c of cases) assert.equal(validateCredentials(...c.args), c.want, JSON.stringify(c.args));
});
