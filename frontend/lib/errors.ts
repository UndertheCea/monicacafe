// Pure helpers for API errors shared by the BFF route handlers, AuthProvider
// and forms. No imports, so `node --test` can load this file directly.
//
// The error contract with the backend (backend/graph/errors.go): every
// GraphQL error carries `extensions.code` (one of API_ERROR_CODES), plus
// `field` (the offending input) on BAD_USER_INPUT / CONFLICT and
// `retryAfter` (whole seconds) on RATE_LIMITED. `message` is English and for
// logs only: the UI picks a t() key from the code and field.

/**
 * Codes the backend sends. A Go test (graph/errors_contract_test.go) fails
 * when this list and graph/errors.go drift apart.
 */
export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_USER_INPUT",
  "CONFLICT",
  "RATE_LIMITED",
  // A fixed cap was reached, e.g. 200 coffees per shop (#213).
  "LIMIT_REACHED",
  // A shop used up its daily image upload budget (#217).
  "UPLOAD_QUOTA",
  // A query too deep or too costly (backend graph/server.go). The site's own
  // queries never get it (a Go test runs them all against the limits), so it
  // falls through to each form's generic message.
  "QUERY_TOO_COMPLEX",
  "INTERNAL_SERVER_ERROR",
] as const;

/** Client-side only: the server couldn't be reached. */
export const UNAVAILABLE = "UNAVAILABLE";

export interface ApiErrorFields {
  code: string;
  message: string;
  field?: string;
  retryAfter?: number;
}

/** Fields of the first error in a GraphQL response's `errors` array. */
export function parseGraphQLErrors(errors: unknown): ApiErrorFields {
  const first: unknown = Array.isArray(errors) ? errors[0] : undefined;
  const obj = typeof first === "object" && first !== null ? (first as Record<string, unknown>) : {};
  const ext =
    typeof obj.extensions === "object" && obj.extensions !== null ? (obj.extensions as Record<string, unknown>) : {};
  const code = typeof ext.code === "string" && ext.code ? ext.code : "INTERNAL_SERVER_ERROR";
  const out: ApiErrorFields = { code, message: typeof obj.message === "string" ? obj.message : "GraphQL error" };
  if (typeof ext.field === "string" && ext.field) out.field = ext.field;
  const retry = retryAfterSeconds(ext.retryAfter);
  if (retry) out.retryAfter = retry;
  return out;
}

/** Message key for a failed page load (server components). */
export function loadErrorKey(code: string): "error.unavailable" | "error.notFound" | "error.retry" {
  if (code === UNAVAILABLE) return "error.unavailable";
  if (code === "NOT_FOUND") return "error.notFound";
  return "error.retry";
}

/** Bilingual "try again in N seconds / minutes" message for RATE_LIMITED. */
export type RateLimitMessage = { key: "error.rateLimitedSec" | "error.rateLimitedMin"; vars: { n: number } };

/** Message for a RATE_LIMITED error; unknown waits read as one minute. */
export function rateLimitMessage(retryAfter?: number): RateLimitMessage {
  const s = retryAfter ?? 60;
  return s < 60
    ? { key: "error.rateLimitedSec", vars: { n: s } }
    : { key: "error.rateLimitedMin", vars: { n: Math.ceil(s / 60) } };
}

/** HTTP status the /api/auth route handlers answer with for a backend error code. */
export function authErrorStatus(code: string): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "BAD_USER_INPUT":
      return 400;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

/** A positive whole number of seconds from a retryAfter extension / header, else undefined. */
export function retryAfterSeconds(v: unknown): number | undefined {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

export type AuthErrorMessage =
  | { key: "auth.error.unavailable" | "auth.error.invalid" | "auth.error.taken" | "auth.error.generic" }
  | { key: "auth.error.suspended" }
  | { key: "auth.error.email" | "auth.error.password" | "auth.error.displayName" }
  | RateLimitMessage;

/** Which bilingual message the login / register form shows for an error. */
export function authErrorMessage(
  mode: "login" | "register",
  code: string,
  field?: string,
  retryAfter?: number,
): AuthErrorMessage {
  if (code === "RATE_LIMITED") return rateLimitMessage(retryAfter);
  if (code === "UNAVAILABLE") return { key: "auth.error.unavailable" };
  if (mode === "login" && code === "UNAUTHENTICATED") return { key: "auth.error.invalid" };
  // Login answers FORBIDDEN only for a suspended account, after the right password (#224).
  if (mode === "login" && code === "FORBIDDEN") return { key: "auth.error.suspended" };
  if (code === "CONFLICT") return { key: "auth.error.taken" };
  if (code === "BAD_USER_INPUT") {
    if (field === "email") return { key: "auth.error.email" };
    if (field === "password") return { key: "auth.error.password" };
    if (field === "displayName") return { key: "auth.error.displayName" };
  }
  return { key: "auth.error.generic" };
}

/**
 * The error for an HTTP 429 whose body isn't the API's JSON: nginx's own
 * request limit (limit_req, #214) answers with an HTML page and no
 * `extensions`. Any other status returns undefined. `retryAfter` is the
 * Retry-After header, if there is one.
 */
export function rateLimitedFromStatus(status: number, retryAfter?: unknown): ApiErrorFields | undefined {
  if (status !== 429) return undefined;
  const out: ApiErrorFields = { code: "RATE_LIMITED", message: "too many requests" };
  const secs = retryAfterSeconds(retryAfter);
  if (secs) out.retryAfter = secs;
  return out;
}
