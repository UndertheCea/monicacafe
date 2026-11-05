// Backend-for-frontend auth endpoints. The refresh token never reaches page
// JavaScript: it lives in an httpOnly cookie scoped to /api/auth, and these
// handlers trade it for short-lived access tokens (kept in memory by
// AuthProvider). POST /api/auth/{login,register,refresh,logout,password}.
import { NextResponse, type NextRequest } from "next/server";
import { authedClient, forwardingClient, query, toApiError } from "@/lib/graphql";
import {
  CHANGE_PASSWORD,
  LOGIN,
  LOGOUT,
  REFRESH,
  REGISTER,
  type SessionErrorBody,
  type SessionPayload,
} from "@/lib/auth/session";
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_MAX_AGE_S,
  forwardedFor,
  jwtExpiryMs,
} from "@/lib/auth/token";
import { authErrorStatus } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action: string }> };

function isSecure(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

/** Reject cross-site requests (defence in depth on top of SameSite=Lax). */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers / curl
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

function fail(status: number, code: string, message: string, field?: string, retryAfter?: number) {
  const body: SessionErrorBody = { code, message, ...(field ? { field } : {}), ...(retryAfter ? { retryAfter } : {}) };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json(body, { status, headers });
}

function clearCookie(res: NextResponse) {
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, sameSite: "lax", path: REFRESH_COOKIE_PATH, maxAge: 0 });
  return res;
}

function ok(req: NextRequest, p: { accessToken: string; refreshToken: string; user: SessionPayload["user"] }) {
  const body: SessionPayload = {
    accessToken: p.accessToken,
    expiresAt: jwtExpiryMs(p.accessToken) ?? Date.now() + 15 * 60_000,
    user: p.user,
  };
  const res = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(REFRESH_COOKIE, p.refreshToken, {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE_S,
  });
  return res;
}

function fromError(err: unknown) {
  const e = toApiError(err);
  return fail(authErrorStatus(e.code), e.code, e.messageEn, e.field, e.retryAfter);
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
  // The backend rate-limits auth per client IP; pass on what nginx saw.
  const client = forwardingClient(forwardedFor(req.headers.get("x-forwarded-for")));

  switch (action) {
    case "login": {
      const b = await readJSON(req);
      try {
        const r = await query(LOGIN, { input: { email: str(b.email), password: str(b.password) } }, client);
        return ok(req, r.login);
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
        return ok(req, r.register);
      } catch (err) {
        return fromError(err);
      }
    }
    case "refresh": {
      const token = req.cookies.get(REFRESH_COOKIE)?.value;
      if (!token) return fail(401, "UNAUTHENTICATED", "no session");
      try {
        const r = await query(REFRESH, { token }, client);
        return ok(req, r.refreshToken);
      } catch (err) {
        const res = fromError(err);
        // Only drop the cookie when the backend rejected it, not on outages.
        return res.status === 401 ? clearCookie(res) : res;
      }
    }
    case "password": {
      // changePassword revokes every refresh token and returns a new pair, so
      // the new refresh token has to land in the cookie here.
      const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!bearer) return fail(401, "UNAUTHENTICATED", "no session");
      const b = await readJSON(req);
      try {
        const r = await query(
          CHANGE_PASSWORD,
          { input: { currentPassword: str(b.currentPassword), newPassword: str(b.newPassword) } },
          authedClient(bearer),
        );
        return ok(req, r.changePassword);
      } catch (err) {
        return fromError(err);
      }
    }
    case "logout": {
      // Revoke server-side sessions when we can; always clear the cookie.
      const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (bearer) {
        try {
          await query(LOGOUT, undefined, authedClient(bearer));
        } catch {
          // Expired access token or backend down: the cookie is still cleared.
        }
      }
      return clearCookie(NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
    }
    default:
      return fail(404, "NOT_FOUND", "unknown auth action");
  }
}
