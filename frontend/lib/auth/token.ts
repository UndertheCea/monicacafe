// Pure auth helpers shared by the /api/auth route handlers and the browser
// AuthProvider. No imports, so `node --test` can load this file directly.

/** Cookie holding the refresh token (httpOnly, scoped to /api/auth). */
export const REFRESH_COOKIE = "mc_rt";
/** Path the refresh cookie is scoped to — only the auth route handlers see it. */
export const REFRESH_COOKIE_PATH = "/api/auth";
/** Refresh tokens live 7 days on the backend; the cookie matches. */
export const REFRESH_MAX_AGE_S = 7 * 24 * 60 * 60;

/**
 * What a POST /api/auth/refresh outcome means for the session (#228). Only a
 * 401 says the session is over; a network error (`null`), a 5xx or a 429 may
 * be a hiccup, so the current session is kept and the refresh retried.
 */
export function refreshOutcome(status: number | null): "session" | "signedOut" | "retry" {
  if (status === null) return "retry";
  if (status === 401) return "signedOut";
  if (status >= 200 && status < 300) return "session";
  return "retry";
}

/** Backoff for retrying a failed refresh: 2 s, 5 s, 15 s, then every minute (#228). */
export function refreshRetryDelayMs(attempt: number): number {
  return [2_000, 5_000, 15_000][attempt] ?? 60_000;
}

/**
 * Session hint (#234): a readable, non-secret cookie set alongside the refresh
 * cookie and cleared with it. It says only "this browser may have a session",
 * so AuthProvider skips the refresh call for visitors who never signed in.
 */
export const SESSION_HINT_COOKIE = "mc_s";

/** Whether a `document.cookie` string carries the session hint. */
export function hasSessionHint(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((c) => c.trim().startsWith(SESSION_HINT_COOKIE + "="));
}

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
 * Sanitise a post-login redirect target: a path on this site only, so
 * `?next=` can't send people to another site. Browsers strip tabs and
 * newlines from URLs and treat "\\" like "/", so "/\t/evil.com" would
 * otherwise resolve to "//evil.com", another origin (#208). Control characters
 * and backslashes are refused outright, the value must resolve to our own
 * origin, and the parsed path (not the raw input) is returned.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  const base = "http://x";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  const path = url.pathname;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path === "/api" || path.startsWith("/api/")) return fallback;
  return path + url.search + url.hash;
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

/**
 * The visitor's address to pass on to the API (as X-Forwarded-For), from the
 * X-Real-IP header nginx sets to the TCP peer it saw. nginx overwrites any
 * X-Real-IP a client sends, so through nginx the visitor can't choose it.
 * Anyone who reaches the Next server directly can, which is why compose
 * publishes :3000 on 127.0.0.1 only and production must not expose it. The
 * client's own X-Forwarded-For is never passed on: a request sent straight to
 * the Next server could put a fresh made-up address in it on every login
 * attempt and so escape the per-IP limits (#211). Without a usable X-Real-IP
 * (a direct hit on :3000) nothing is passed on, and the API counts the request
 * against the Next server's own address, which only makes limits stricter.
 */
export function clientAddress(realIp: string | null): string | undefined {
  const v = (realIp ?? "").trim();
  if (!/^[0-9a-fA-F:.]{2,45}$/.test(v)) return undefined;
  // A dotted quad, or something with at least two colons (IPv6).
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (v4) return v4.slice(1).every((o) => Number(o) <= 255) ? v : undefined;
  return /^[0-9a-fA-F]*(:[0-9a-fA-F]*){2,7}(:\d{1,3}(\.\d{1,3}){3})?$/.test(v) || /^[0-9a-fA-F:]*::[0-9a-fA-F:.]*$/.test(v)
    ? v
    : undefined;
}

/**
 * The token from an `Authorization: Bearer …` header, or null when the header
 * is missing, uses another scheme, or carries no token.
 */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}
