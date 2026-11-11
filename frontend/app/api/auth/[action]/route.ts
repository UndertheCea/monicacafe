// Backend-for-frontend auth endpoints. The refresh token never reaches page
// JavaScript: it lives in an httpOnly cookie (`__Host-` prefixed and Secure on an HTTPS SITE_URL, else scoped to /api/auth), and these
// handlers trade it for short-lived access tokens (kept in memory by
// AuthProvider). POST /api/auth/{login,register,refresh,logout,logout-all,password,delete-account}.
import { NextResponse, type NextRequest } from "next/server";
import { authedClient, forwardingClient, query, toApiError } from "@/lib/graphql";
import {
  CHANGE_PASSWORD,
  DELETE_ACCOUNT,
  LOGIN,
  LOGOUT,
  LOGOUT_EVERYWHERE,
  REFRESH,
  REGISTER,
  type SessionErrorBody,
  type SessionPayload,
} from "@/lib/auth/session";
import {
  LEGACY_REFRESH_COOKIE,
  LEGACY_REFRESH_COOKIE_PATH,
  isHttpsSite,
  originAllowed,
  readRefreshToken,
  refreshCookie,
} from "@/lib/auth/cookie";
import {
  REFRESH_MAX_AGE_S,
  SESSION_HINT_COOKIE,
  bearerToken,
  clientAddress,
  jwtExpiryMs,
} from "@/lib/auth/token";
import { authErrorStatus } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action: string }> };

// Secure-ness and the cookie name come from SITE_URL, never from request headers.
const siteUrl = () => process.env.SITE_URL;

/** Reject cross-site requests (defence in depth on top of SameSite=Lax). */
function sameOrigin(req: NextRequest): boolean {
  return originAllowed({
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    siteUrl: siteUrl(),
    dev: process.env.NODE_ENV === "development",
  });
}

function fail(status: number, code: string, message: string, field?: string, retryAfter?: number) {
  const body: SessionErrorBody = { code, message, ...(field ? { field } : {}), ...(retryAfter ? { retryAfter } : {}) };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json(body, { status, headers });
}

function clearCookie(res: NextResponse) {
  const c = refreshCookie(siteUrl());
  res.cookies.set(c.name, "", { httpOnly: true, secure: c.secure, sameSite: "lax", path: c.path, maxAge: 0 });
  clearLegacyCookie(res, c.name);
  res.cookies.set(SESSION_HINT_COOKIE, "", { secure: isHttpsSite(siteUrl()), sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

/** Drop the pre-#215 cookie (one release of migration) when the current one has another name. */
function clearLegacyCookie(res: NextResponse, currentName: string) {
  if (currentName === LEGACY_REFRESH_COOKIE) return;
  res.cookies.set(LEGACY_REFRESH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: LEGACY_REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}

function ok(p: { accessToken: string; refreshToken: string; user: SessionPayload["user"] }) {
  const body: SessionPayload = {
    accessToken: p.accessToken,
    expiresAt: jwtExpiryMs(p.accessToken) ?? Date.now() + 15 * 60_000,
    user: p.user,
  };
  const res = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  const c = refreshCookie(siteUrl());
  res.cookies.set(c.name, p.refreshToken, {
    httpOnly: true,
    secure: c.secure,
    sameSite: "lax",
    path: c.path,
    maxAge: REFRESH_MAX_AGE_S,
  });
  clearLegacyCookie(res, c.name);
  // Readable by page JavaScript on purpose and holds no secret: it only tells
  // AuthProvider that a refresh is worth trying (#234).
  res.cookies.set(SESSION_HINT_COOKIE, "1", {
    secure: c.secure,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE_S,
  });
  return res;
}

function fromError(err: unknown) {
  const e = toApiError(err);
  return fail(authErrorStatus(e.code), e.code, e.message, e.field, e.retryAfter);
}

async function readJSON(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await req.json();
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(req: NextRequest, { params }: Ctx) {
  const { action } = await params;
  if (!sameOrigin(req)) return fail(403, "FORBIDDEN", "cross-site request rejected");
  // The backend rate-limits auth per client IP; pass on the address nginx saw
  // (X-Real-IP), never the client's own X-Forwarded-For (#211).
  const client = forwardingClient(clientAddress(req.headers.get("x-real-ip")));

  switch (action) {
    case "login": {
      const b = await readJSON(req);
      try {
        const r = await query(LOGIN, { input: { email: str(b.email), password: str(b.password) } }, client);
        return ok(r.login);
      } catch (err) {
        return fromError(err);
      }
    }
    case "register": {
      const b = await readJSON(req);
      try {
        const r = await query(REGISTER, {
          input: { email: str(b.email), password: str(b.password), displayName: str(b.displayName) },
        }, client);
        return ok(r.register);
      } catch (err) {
        return fromError(err);
      }
    }
    case "refresh": {
      const token = readRefreshToken((n) => req.cookies.get(n)?.value, siteUrl());
      if (!token) return fail(401, "UNAUTHENTICATED", "no session");
      try {
        const r = await query(REFRESH, { token }, client);
        return ok(r.refreshToken);
      } catch (err) {
        const res = fromError(err);
        // Only drop the cookie when the backend rejected it, not on outages.
        return res.status === 401 ? clearCookie(res) : res;
      }
    }
    case "password": {
      // changePassword revokes every refresh token and returns a new pair, so
      // the new refresh token has to land in the cookie here.
      const bearer = bearerToken(req.headers.get("authorization"));
      if (!bearer) return fail(401, "UNAUTHENTICATED", "no session");
      const b = await readJSON(req);
      try {
        const r = await query(
          CHANGE_PASSWORD,
          { input: { currentPassword: str(b.currentPassword), newPassword: str(b.newPassword) } },
          authedClient(bearer),
        );
        return ok(r.changePassword);
      } catch (err) {
        return fromError(err);
      }
    }
    case "logout": {
      // End this browser's session (the cookie's refresh token proves it, so
      // an expired access token doesn't matter); always clear the cookie.
      const token = readRefreshToken((n) => req.cookies.get(n)?.value, siteUrl());
      if (token) {
        try {
          await query(LOGOUT, { refreshToken: token }, client);
        } catch {
          // Backend down: the cookie is still cleared; the token expires on its own.
        }
      }
      return clearCookie(NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
    }
    case "logout-all": {
      // Every session of the user, this one included. Needs a valid access
      // token: on 401 the browser refreshes and retries.
      const bearer = bearerToken(req.headers.get("authorization"));
      if (!bearer) return fail(401, "UNAUTHENTICATED", "no session");
      try {
        await query(LOGOUT_EVERYWHERE, undefined, authedClient(bearer));
      } catch (err) {
        return fromError(err);
      }
      return clearCookie(NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
    }
    case "delete-account": {
      // Deletes the account (the backend re-checks the password) and clears
      // the now-dead refresh cookie, which page JavaScript can't reach.
      const bearer = bearerToken(req.headers.get("authorization"));
      if (!bearer) return fail(401, "UNAUTHENTICATED", "no session");
      const b = await readJSON(req);
      try {
        await query(DELETE_ACCOUNT, { password: str(b.password) }, authedClient(bearer));
      } catch (err) {
        return fromError(err);
      }
      return clearCookie(NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
    }
    default:
      return fail(404, "NOT_FOUND", "unknown auth action");
  }
}
