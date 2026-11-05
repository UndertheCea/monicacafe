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
  retryAfterSeconds,
} from "../lib/errors.ts";

test("authErrorStatus", () => {
  const cases = [
    ["UNAUTHENTICATED", 401],
    ["BAD_USER_INPUT", 400],
    ["CONFLICT", 409],
    ["RATE_LIMITED", 429],
    ["UNAVAILABLE", 503],
    ["INTERNAL_SERVER_ERROR", 500],
    ["", 500],
  ];
  for (const [code, want] of cases) assert.equal(authErrorStatus(code), want, code);
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
    { args: ["login", "RATE_LIMITED", undefined, 30], want: { key: "error.rateLimitedSec", vars: { n: 30 } } },
    { args: ["login", "RATE_LIMITED", undefined, 61], want: { key: "error.rateLimitedMin", vars: { n: 2 } } },
    { args: ["register", "RATE_LIMITED"], want: { key: "error.rateLimitedMin", vars: { n: 1 } } },
    { args: ["login", "UNAUTHENTICATED"], want: { key: "auth.error.invalid" } },
    { args: ["register", "UNAUTHENTICATED"], want: { key: "auth.error.generic" } },
    { args: ["register", "CONFLICT", "email"], want: { key: "auth.error.taken" } },
    { args: ["register", "BAD_USER_INPUT", "password"], want: { key: "auth.error.password" } },
    { args: ["register", "BAD_USER_INPUT", "other"], want: { key: "auth.error.generic" } },
    { args: ["login", "UNAVAILABLE"], want: { key: "auth.error.unavailable" } },
  ];
  for (const c of cases) assert.deepEqual(authErrorMessage(...c.args), c.want, c.args.join(" "));
});

test("rateLimitMessage", () => {
  const cases = [
    [1, { key: "error.rateLimitedSec", vars: { n: 1 } }],
    [59, { key: "error.rateLimitedSec", vars: { n: 59 } }],
    [60, { key: "error.rateLimitedMin", vars: { n: 1 } }],
    [3600, { key: "error.rateLimitedMin", vars: { n: 60 } }],
    [undefined, { key: "error.rateLimitedMin", vars: { n: 1 } }],
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
