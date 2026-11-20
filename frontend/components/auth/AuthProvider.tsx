"use client";

// Browser session state. The access token lives only in memory; the refresh
// token is an httpOnly cookie that only /api/auth/* can read. On load we trade
// the cookie for a fresh access token, then refresh a minute before expiry.

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, authedClient, toApiError, unavailable, type TypedDocument } from "@/lib/graphql";
import type { SessionErrorBody, SessionPayload, SessionUser } from "@/lib/auth/session";
import { createAuthEpoch, hasSessionHint, nextSessionKey, type SessionKey, refreshDelayMs, refreshOutcome, refreshRetryDelayMs } from "@/lib/auth/token";
import { rateLimitedFromStatus, retryAfterSeconds } from "@/lib/errors";

type State =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: SessionPayload };

export interface AuthContextValue {
  status: State["status"];
  user: SessionUser | null;
  login(email: string, password: string): Promise<SessionUser>;
  register(email: string, password: string, displayName: string): Promise<SessionUser>;
  /** Sign out of this browser only (other devices stay signed in). */
  logout(): Promise<void>;
  /** End every session of the account, this one included. */
  logoutEverywhere(): Promise<void>;
  /** Delete the account (password re-checked); signs this and every other tab out. */
  deleteAccount(password: string): Promise<void>;
  /** Change the password; every other session ends, this one continues. */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Re-fetch the session (new token + user), e.g. after opening a shop. */
  reload(): Promise<SessionUser | null>;
  /** Run an authenticated GraphQL request, refreshing the token once on 401. */
  request<TData, TVars extends Record<string, unknown>>(
    doc: TypedDocument<TData, TVars>,
    vars?: TVars,
  ): Promise<TData>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const CHANNEL = "mc-auth";

// One refresh at a time per tab; across tabs the Web Locks API serialises
// them, so the second tab sends the cookie the first one just rotated (the
// backend revokes every session when a refresh token is reused).
let inflight: Promise<SessionPayload | null> | null = null;

// Bumped on login, register and logout (here or in another tab): a refresh
// that started before the bump is dropped when it lands (#344).
const epoch = createAuthEpoch();

/** Runs fn under the cross-tab refresh lock (directly where there is none). */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && "locks" in navigator
    ? navigator.locks.request("mc-auth-refresh", fn).then((v) => v)
    : fn();
}

// Resolves to the new session, or null when the server says the session is
// over (401). Anything else (network error, 5xx, 429) rejects: the session may
// still be fine, so callers keep it and try again later (#228).
function refreshSession(): Promise<SessionPayload | null> {
  if (!inflight) {
    const run = async (): Promise<SessionPayload | null> => {
      let res: Response;
      try {
        res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      } catch {
        throw unavailable();
      }
      const outcome = refreshOutcome(res.status);
      if (outcome === "signedOut") return null;
      if (outcome === "retry") throw await asError(res);
      return (await res.json()) as SessionPayload;
    };
    // lib.dom types locks.request as Promise<Promise<T>>; withRefreshLock's .then flattens it.
    const p: Promise<SessionPayload | null> = withRefreshLock(run);
    const tracked = p.finally(() => {
      inflight = null;
    });
    inflight = tracked;
    return tracked;
  }
  return inflight;
}

async function asError(res: Response): Promise<ApiError> {
  try {
    const b = (await res.json()) as SessionErrorBody;
    return new ApiError(b.code, b.message, b.field, retryAfterSeconds(b.retryAfter ?? res.headers.get("retry-after")));
  } catch {
    // Not JSON: nginx's own 429 (#214) still reads as "too many requests".
    const limited = rateLimitedFromStatus(res.status, res.headers.get("retry-after"));
    return limited ? new ApiError(limited.code, limited.message, undefined, limited.retryAfter) : unavailable();
  }
}

async function postAuth(action: "login" | "register", body: Record<string, string>): Promise<SessionPayload> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${action}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw unavailable();
  }
  if (!res.ok) throw await asError(res);
  return (await res.json()) as SessionPayload;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  // Mirrors `state` for callbacks; updated eagerly in apply() so a request
  // made right after a refresh sees the new token before React re-renders.
  const stateRef = useRef<State>(state);
  const channelRef = useRef<BroadcastChannel | null>(null);
  // Remount key for the children: bumped when a different user signs in (#436).
  const sessionKeyRef = useRef<SessionKey>({ userId: null, key: 0 });
  const [sessionKey, setSessionKey] = useState(0);

  const apply = useCallback((s: SessionPayload | null) => {
    const next: State = s ? { status: "authenticated", session: s } : { status: "anonymous" };
    stateRef.current = next;
    sessionKeyRef.current = nextSessionKey(sessionKeyRef.current, s?.user.id ?? null);
    setSessionKey(sessionKeyRef.current.key);
    setState(next);
    return s;
  }, []);

  // Pending retry after a failed refresh: the attempt number, or null.
  const [retryAttempt, setRetryAttempt] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const startedAt = epoch.current();
    try {
      const got = await refreshSession();
      if (epoch.stale(startedAt)) {
        // Logged out (or in) while this refresh was in flight: keep that state.
        const cur = stateRef.current;
        return cur.status === "authenticated" ? cur.session.user : null;
      }
      const s = apply(got);
      setRetryAttempt(null);
      return s?.user ?? null;
    } catch {
      if (epoch.stale(startedAt)) return null;
      // A hiccup, not a verdict (#228): keep the current session (a seller's
      // form stays usable) and retry with backoff. Only a first load with
      // nothing to keep shows the signed-out UI meanwhile.
      if (stateRef.current.status === "loading") apply(null);
      setRetryAttempt((a) => (a === null ? 0 : a + 1));
      const cur = stateRef.current;
      return cur.status === "authenticated" ? cur.session.user : null;
    }
  }, [apply]);

  useEffect(() => {
    if (retryAttempt === null) return;
    const id = window.setTimeout(() => void reload(), refreshRetryDelayMs(retryAttempt));
    return () => window.clearTimeout(id);
  }, [retryAttempt, reload]);

  // Initial load + cross-tab sync.
  useEffect(() => {
    // Visitors who never signed in (no hint cookie) make no auth request at all (#234).
    const startedAt = epoch.current();
    const initial = hasSessionHint(document.cookie) ? refreshSession() : Promise.resolve(null);
    initial.then((s) => {
      if (!epoch.stale(startedAt)) apply(s);
    }, () => {
      if (epoch.stale(startedAt)) return;
      // Server unreachable on first load: signed-out UI for now, retry with backoff (#228).
      apply(null);
      setRetryAttempt(0);
    });
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent<"login" | "logout">) => {
      if (e.data === "logout") {
        epoch.bump();
        apply(null);
      }
      else void reload();
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [apply, reload]);

  // Refresh shortly before the access token expires.
  const expiresAt = state.status === "authenticated" ? state.session.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const id = window.setTimeout(() => void reload(), refreshDelayMs(expiresAt, Date.now()));
    return () => window.clearTimeout(id);
  }, [expiresAt, reload]);

  const login = useCallback(
    async (email: string, password: string) => {
      const s = await postAuth("login", { email, password });
      epoch.bump();
      apply(s);
      channelRef.current?.postMessage("login");
      return s.user;
    },
    [apply],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const s = await postAuth("register", { email, password, displayName });
      epoch.bump();
      apply(s);
      channelRef.current?.postMessage("login");
      return s.user;
    },
    [apply],
  );

  const logout = useCallback(async () => {
    setRetryAttempt(null);
    // A refresh still in flight must not sign the user back in (#344): its
    // result is dropped, and the logout waits for it (and, under the refresh
    // lock, for other tabs' refreshes) so it revokes the newest cookie.
    epoch.bump();
    try {
      await inflight?.catch(() => null);
      // The route handler revokes the session named by the httpOnly cookie.
      await withRefreshLock(() => fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }));
    } finally {
      epoch.bump();
      apply(null);
      channelRef.current?.postMessage("logout");
    }
  }, [apply]);

  const logoutEverywhere = useCallback(async () => {
    const send = async (token: string) => {
      try {
        return await fetch("/api/auth/logout-all", {
          method: "POST",
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        throw unavailable();
      }
    };
    const cur = stateRef.current;
    let token = cur.status === "authenticated" ? cur.session.accessToken : null;
    if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
    let res = await send(token);
    if (res.status === 401) {
      token = apply(await refreshSession())?.accessToken ?? null;
      if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
      res = await send(token);
    }
    if (!res.ok) throw await asError(res);
    // Like logout (#344): a refresh in flight, or a pending retry, must not
    // put the ended session back (#407).
    setRetryAttempt(null);
    epoch.bump();
    apply(null);
    channelRef.current?.postMessage("logout");
  }, [apply]);

  const deleteAccount = useCallback(
    async (password: string) => {
      const send = async (token: string) => {
        try {
          return await fetch("/api/auth/delete-account", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password }),
          });
        } catch {
          throw unavailable();
        }
      };
      const cur = stateRef.current;
      let token = cur.status === "authenticated" ? cur.session.accessToken : null;
      if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
      let res = await send(token);
      if (res.status === 401) {
        token = apply(await refreshSession())?.accessToken ?? null;
        if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
        res = await send(token);
      }
      if (!res.ok) throw await asError(res);
      setRetryAttempt(null);
      epoch.bump(); // as in logout (#344, #407)
      apply(null);
      channelRef.current?.postMessage("logout");
    },
    [apply],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const send = async (token: string) => {
        try {
          return await fetch("/api/auth/password", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
        } catch {
          throw unavailable();
        }
      };
      const cur = stateRef.current;
      let token = cur.status === "authenticated" ? cur.session.accessToken : null;
      if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
      let res = await send(token);
      if (res.status === 401) {
        // Access token expired: refresh once and retry.
        token = apply(await refreshSession())?.accessToken ?? null;
        if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
        res = await send(token);
      }
      if (!res.ok) throw await asError(res);
      apply((await res.json()) as SessionPayload);
      // Other tabs pick up the rotated cookie.
      channelRef.current?.postMessage("login");
    },
    [apply],
  );

  const request = useCallback(
    async <TData, TVars extends Record<string, unknown>>(doc: TypedDocument<TData, TVars>, vars?: TVars) => {
      const run = (token: string) => authedClient(token).request<TData>(doc, vars);
      const cur = stateRef.current;
      let token = cur.status === "authenticated" ? cur.session.accessToken : null;
      if (!token && cur.status === "loading") {
        // Called before the initial refresh settled: use the shared in-flight one.
        token = apply(await refreshSession())?.accessToken ?? null;
      }
      if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
      try {
        return await run(token);
      } catch (err) {
        const e = toApiError(err);
        if (e.code !== "UNAUTHENTICATED") throw e;
        const s = apply(await refreshSession());
        if (!s) throw e;
        try {
          return await run(s.accessToken);
        } catch (err2) {
          throw toApiError(err2);
        }
      }
    },
    [apply],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.status === "authenticated" ? state.session.user : null,
      login,
      register,
      logout,
      logoutEverywhere,
      deleteAccount,
      changePassword,
      reload,
      request,
    }),
    [state, login, register, logout, logoutEverywhere, deleteAccount, changePassword, reload, request],
  );

  return (
    <AuthContext.Provider value={value}>
      <Fragment key={sessionKey}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
