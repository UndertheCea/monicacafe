// Pure helpers for the refresh cookie and the CSRF check, driven by SITE_URL
// (not by x-forwarded-* headers a proxy may or may not set). `node --test`
// loads this file directly.
import { siteBase } from "../sitemap.ts";

/** Pre-#215 cookie (plain name, scoped to /api/auth). Read and cleared for one release. */
export const LEGACY_REFRESH_COOKIE = "mc_rt";
export const LEGACY_REFRESH_COOKIE_PATH = "/api/auth";
/** Cookie on an HTTPS site: the `__Host-` prefix needs Secure, Path=/ and no Domain. */
export const HOST_REFRESH_COOKIE = "__Host-mc_rt";

export function isHttpsSite(siteUrl: string | undefined): boolean {
  return siteBase(siteUrl).startsWith("https://");
}

export interface RefreshCookie {
  name: string;
  path: string;
  secure: boolean;
}

/** Name, path and Secure flag of the refresh cookie for this SITE_URL. */
export function refreshCookie(siteUrl: string | undefined): RefreshCookie {
  return isHttpsSite(siteUrl)
    ? { name: HOST_REFRESH_COOKIE, path: "/", secure: true }
    : { name: LEGACY_REFRESH_COOKIE, path: LEGACY_REFRESH_COOKIE_PATH, secure: false };
}

/** The refresh token from a cookie reader: the current name first, then the legacy one. */
export function readRefreshToken(
  get: (name: string) => string | undefined,
  siteUrl: string | undefined,
): string | undefined {
  return get(refreshCookie(siteUrl).name) || get(LEGACY_REFRESH_COOKIE) || undefined;
}

export interface OriginCheck {
  origin: string | null;
  secFetchSite: string | null;
  siteUrl: string | undefined;
  dev?: boolean;
}

/**
 * CSRF check for the auth route handlers. The Origin must be SITE_URL's origin
 * (plus http://localhost:3000 in development); when Sec-Fetch-Site is sent it
 * must be `same-origin`. No Origin is fine only for non-browser clients, i.e.
 * when Sec-Fetch-Site is absent too.
 */
export function originAllowed({ origin, secFetchSite, siteUrl, dev = false }: OriginCheck): boolean {
  if (secFetchSite !== null && secFetchSite !== "same-origin") return false;
  if (!origin) return secFetchSite === null;
  let o: string;
  try {
    o = new URL(origin).origin;
  } catch {
    return false;
  }
  const allowed = [new URL(siteBase(siteUrl)).origin, ...(dev ? ["http://localhost:3000"] : [])];
  return allowed.includes(o);
}
