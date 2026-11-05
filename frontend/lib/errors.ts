// Pure helpers for API errors shared by the BFF route handlers, AuthProvider
// and forms. No imports, so `node --test` can load this file directly.

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
  if (code === "CONFLICT") return { key: "auth.error.taken" };
  if (code === "BAD_USER_INPUT") {
    if (field === "email") return { key: "auth.error.email" };
    if (field === "password") return { key: "auth.error.password" };
    if (field === "displayName") return { key: "auth.error.displayName" };
  }
  return { key: "auth.error.generic" };
}
