// Pure auth helpers shared by the /api/auth route handlers and the browser
// AuthProvider. No imports, so `node --test` can load this file directly.

/** Cookie holding the refresh token (httpOnly, scoped to /api/auth). */
export const REFRESH_COOKIE = "mc_rt";
/** Path the refresh cookie is scoped to — only the auth route handlers see it. */
export const REFRESH_COOKIE_PATH = "/api/auth";
/** Refresh tokens live 7 days on the backend; the cookie matches. */
export const REFRESH_MAX_AGE_S = 7 * 24 * 60 * 60;

/**
 * Expiry (ms since epoch) from a JWT's `exp` claim, or null when the token is
 * malformed. Only decodes — the backend verifies signatures.
 */
export function jwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload !== "object" || payload === null) return null;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * How long to wait before refreshing an access token that expires at
 * `expiresAt`: one minute early, never less than 5 s, and capped so a bogus
 * far-future expiry still refreshes within 15 minutes.
 */
export function refreshDelayMs(expiresAt: number, now: number): number {
  const early = expiresAt - now - 60_000;
  return Math.min(Math.max(early, 5_000), 15 * 60_000);
}

/**
 * Sanitise a post-login redirect target: same-origin absolute paths only, so
 * `?next=` can't send people to another site.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/api/")) return fallback;
  return next;
}

/**
 * Light client-side checks; the backend re-validates everything. Pass
 * `password: null` to skip the length rule (login only needs it non-empty).
 */
export function validateCredentials(
  email: string,
  password: string | null,
  displayName?: string,
): "email" | "password" | "displayName" | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "email";
  if (password !== null) {
    const bytes = new TextEncoder().encode(password).length;
    if (bytes < 8 || bytes > 72) return "password";
  }
  if (displayName !== undefined) {
    const n = [...displayName.trim()].length;
    if (n < 1 || n > 50) return "displayName";
  }
  return null;
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
  | { key: "auth.error.rateLimitedSec" | "auth.error.rateLimitedMin"; vars: { n: number } };

/** Which bilingual message the login / register form shows for an error. */
export function authErrorMessage(
  mode: "login" | "register",
  code: string,
  field?: string,
  retryAfter?: number,
): AuthErrorMessage {
  if (code === "RATE_LIMITED") {
    const s = retryAfter ?? 60;
    return s < 60
      ? { key: "auth.error.rateLimitedSec", vars: { n: s } }
      : { key: "auth.error.rateLimitedMin", vars: { n: Math.ceil(s / 60) } };
  }
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

/**
 * X-Forwarded-For value the BFF sends to the backend: the header nginx set,
 * trimmed and capped so a client can't bloat backend requests. The backend
 * only believes it because the BFF is a trusted proxy (TRUSTED_PROXIES).
 */
export function forwardedFor(header: string | null): string | undefined {
  if (!header) return undefined;
  const hops = header
    .split(",")
    .map((h) => h.trim())
    .filter((h) => /^[0-9a-fA-F:.]{2,45}$/.test(h));
  // Keep the rightmost hops: those were appended by our own proxies.
  return hops.length ? hops.slice(-5).join(", ") : undefined;
}
