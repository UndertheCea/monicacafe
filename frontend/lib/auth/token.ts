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
