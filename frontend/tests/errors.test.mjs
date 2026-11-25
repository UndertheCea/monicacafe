// API error helpers (lib/errors.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  API_ERROR_CODES,
  UNAVAILABLE,
  authErrorMessage,
  authErrorStatus,
  loadErrorKey,
  parseGraphQLErrors,
  rateLimitMessage,
  rateLimitedFromStatus,
  retryAfterSeconds,
  unavailableFromStatus,
} from "../lib/errors.ts";

test("authErrorStatus", () => {
  const cases = [
    ["UNAUTHENTICATED", 401],
    ["BAD_USER_INPUT", 400],
    ["CONFLICT", 409],
    ["FORBIDDEN", 403],
    ["RATE_LIMITED", 429],
    ["UNAVAILABLE", 503],
    ["INTERNAL_SERVER_ERROR", 500],
    ["", 500],
  ];
  for (const [code, want] of cases) assert.equal(authErrorStatus(code), want, code);
});

test("authErrorStatus: every refusal code is a 4xx, never a 500 (#465)", () => {
  for (const code of API_ERROR_CODES) {
    if (code === "INTERNAL_SERVER_ERROR") continue;
    const st = authErrorStatus(code);
    assert.ok(st >= 400 && st < 500, `${code} -> ${st}`);
  }
  assert.equal(authErrorStatus("CONTACT_INFO_NOT_ALLOWED"), 400);
  assert.equal(authErrorStatus("NOT_FOUND"), 404);
  assert.equal(authErrorStatus("STOCK_CHANGED"), 409);
});

test("retryAfterSeconds", () => {
  const cases = [
    [30, 30],
    ["120", 120],
    [" 7 ", 7],
    [0, undefined],
    [-5, undefined],
    [1.5, undefined],
    ["soon", undefined],
    [null, undefined],
    [undefined, undefined],
  ];
  for (const [v, want] of cases) assert.equal(retryAfterSeconds(v), want, String(v));
});

test("authErrorMessage", () => {
  const cases = [
    { args: ["login", "RATE_LIMITED", undefined, 30], want: { key: "error.rateLimitedSec.other", vars: { n: 30 } } },
    { args: ["login", "RATE_LIMITED", undefined, 61], want: { key: "error.rateLimitedMin.other", vars: { n: 2 } } },
    { args: ["register", "RATE_LIMITED"], want: { key: "error.rateLimitedMin.one", vars: { n: 1 } } },
    { args: ["login", "UNAUTHENTICATED"], want: { key: "auth.error.invalid" } },
    { args: ["register", "UNAUTHENTICATED"], want: { key: "auth.error.generic" } },
    { args: ["register", "CONFLICT", "email"], want: { key: "auth.error.taken" } },
    { args: ["register", "BAD_USER_INPUT", "password"], want: { key: "auth.error.password" } },
    { args: ["register", "BAD_USER_INPUT", "other"], want: { key: "auth.error.generic" } },
    { args: ["register", "BAD_USER_INPUT", "displayName"], want: { key: "auth.error.displayName" } },
    { args: ["register", "CONTACT_INFO_NOT_ALLOWED", "displayName"], want: { key: "auth.error.displayName" } },
    // The name sent holds a zero-width space or a bidi mark: say so, not the length rule (#500).
    { args: ["register", "BAD_USER_INPUT", "displayName", undefined, "Mo\u200bni"], want: { key: "form.error.badChars" } },
    { args: ["register", "BAD_USER_INPUT", "displayName", undefined, "\u202eMoni"], want: { key: "form.error.badChars" } },
    { args: ["register", "BAD_USER_INPUT", "displayName", undefined, "Moni"], want: { key: "auth.error.displayName" } },
    { args: ["register", "CONTACT_INFO_NOT_ALLOWED", "displayName", undefined, "Mo\u200bni"], want: { key: "auth.error.displayName" } },
    { args: ["login", "UNAVAILABLE"], want: { key: "auth.error.unavailable" } },
    { args: ["login", "FORBIDDEN"], want: { key: "auth.error.suspended" } },
    { args: ["register", "FORBIDDEN"], want: { key: "auth.error.generic" } },
  ];
  for (const c of cases) assert.deepEqual(authErrorMessage(...c.args), c.want, c.args.join(" "));
});

test("rateLimitMessage", () => {
  const cases = [
    [1, { key: "error.rateLimitedSec.one", vars: { n: 1 } }],
    [59, { key: "error.rateLimitedSec.other", vars: { n: 59 } }],
    [60, { key: "error.rateLimitedMin.one", vars: { n: 1 } }],
    [3600, { key: "error.rateLimitedMin.other", vars: { n: 60 } }],
    [undefined, { key: "error.rateLimitedMin.one", vars: { n: 1 } }],
  ];
  for (const [s, want] of cases) assert.deepEqual(rateLimitMessage(s), want, String(s));
});

test("parseGraphQLErrors", () => {
  const cases = [
    {
      name: "rate limited",
      in: [{ message: "too many attempts", extensions: { code: "RATE_LIMITED", retryAfter: 42 } }],
      want: { code: "RATE_LIMITED", message: "too many attempts", retryAfter: 42 },
    },
    {
      name: "bad input with field",
      in: [{ message: "bad", extensions: { code: "BAD_USER_INPUT", field: "email" } }, { message: "second" }],
      want: { code: "BAD_USER_INPUT", message: "bad", field: "email" },
    },
    {
      name: "gqlgen validation error without code",
      in: [{ message: "Cannot query field" }],
      want: { code: "INTERNAL_SERVER_ERROR", message: "Cannot query field" },
    },
    { name: "no errors array", in: undefined, want: { code: "INTERNAL_SERVER_ERROR", message: "GraphQL error" } },
    { name: "garbage", in: ["x", null], want: { code: "INTERNAL_SERVER_ERROR", message: "GraphQL error" } },
    {
      name: "bad retryAfter dropped",
      in: [{ message: "m", extensions: { code: "RATE_LIMITED", retryAfter: -1, field: 3 } }],
      want: { code: "RATE_LIMITED", message: "m" },
    },
    {
      name: "available stock on a cart write",
      in: [{ message: "m", extensions: { code: "BAD_USER_INPUT", field: "quantity", available: 3 } }],
      want: { code: "BAD_USER_INPUT", message: "m", field: "quantity", available: 3 },
    },
    {
      name: "zero left is kept, a bad count is dropped",
      in: [{ message: "m", extensions: { code: "BAD_USER_INPUT", available: 0 } }],
      want: { code: "BAD_USER_INPUT", message: "m", available: 0 },
    },
    {
      name: "negative or fractional available dropped",
      in: [{ message: "m", extensions: { code: "BAD_USER_INPUT", available: -1 } }],
      want: { code: "BAD_USER_INPUT", message: "m" },
    },
  ];
  for (const c of cases) assert.deepEqual(parseGraphQLErrors(c.in), c.want, c.name);
});

test("loadErrorKey", () => {
  assert.equal(loadErrorKey("UNAVAILABLE"), "error.unavailable");
  assert.equal(loadErrorKey("NOT_FOUND"), "error.notFound");
  assert.equal(loadErrorKey("INTERNAL_SERVER_ERROR"), "error.retry");
});

test("API_ERROR_CODES are unique and upper snake case", () => {
  assert.equal(new Set(API_ERROR_CODES).size, API_ERROR_CODES.length);
  for (const c of API_ERROR_CODES) assert.match(c, /^[A-Z][A-Z_]*$/);
  assert.ok(!API_ERROR_CODES.includes(UNAVAILABLE), "UNAVAILABLE is client-only");
});

test("rateLimitedFromStatus: nginx's non-JSON 429 maps to RATE_LIMITED", () => {
  const msg = "too many requests";
  const cases = [
    [429, undefined, { code: "RATE_LIMITED", message: msg }],
    [429, "30", { code: "RATE_LIMITED", message: msg, retryAfter: 30 }],
    [429, "soon", { code: "RATE_LIMITED", message: msg }],
    [503, "30", undefined],
    [200, undefined, undefined],
  ];
  for (const [status, retry, want] of cases) assert.deepEqual(rateLimitedFromStatus(status, retry), want, `${status} ${retry}`);
});

test("unavailableFromStatus: 502 / 503 / 504 read as UNAVAILABLE, nothing else does (#527)", () => {
  const want = { code: UNAVAILABLE, message: "could not reach the server" };
  for (const status of [502, 503, 504]) assert.deepEqual(unavailableFromStatus(status), want, String(status));
  for (const status of [200, 400, 404, 429, 500, 501]) assert.equal(unavailableFromStatus(status), undefined, String(status));
});
