"use client";

// Browser session state. The access token lives only in memory; the refresh
// token is an httpOnly cookie that only /api/auth/* can read. On load we trade
// the cookie for a fresh access token, then refresh a minute before expiry.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, authedClient, toApiError, unavailable, type TypedDocument } from "@/lib/graphql";
import type { SessionErrorBody, SessionPayload, SessionUser } from "@/lib/auth/session";
import { refreshDelayMs } from "@/lib/auth/token";
import { retryAfterSeconds } from "@/lib/errors";

type State =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: SessionPayload };

export interface AuthContextValue {
  status: State["status"];
  user: SessionUser | null;
  login(email: string, password: string): Promise<SessionUser>;
  register(email: string, password: string, displayName: string): Promise<SessionUser>;
  logout(): Promise<void>;
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

function refreshSession(): Promise<SessionPayload | null> {
  if (!inflight) {
    const run = async (): Promise<SessionPayload | null> => {
      const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      if (res.status === 401) return null;
      if (!res.ok) throw await asError(res);
      return (await res.json()) as SessionPayload;
    };
    const p: Promise<SessionPayload | null> =
      typeof navigator !== "undefined" && "locks" in navigator
        ? // lib.dom types the result as Promise<Promise<T>>; .then flattens it.
          navigator.locks.request("mc-auth-refresh", run).then((v) => v)
        : run();
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
    return unavailable();
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

  const apply = useCallback((s: SessionPayload | null) => {
    const next: State = s ? { status: "authenticated", session: s } : { status: "anonymous" };
    stateRef.current = next;
    setState(next);
    return s;
  }, []);

  const reload = useCallback(async () => {
    try {
      return (await apply(await refreshSession()))?.user ?? null;
    } catch {
      // Backend unreachable: keep the cookie, show the signed-out UI for now.
      apply(null);
      return null;
    }
  }, [apply]);

  // Initial load + cross-tab sync.
  useEffect(() => {
    refreshSession().then(apply, () => apply(null)); // same as reload(), state set in the callback
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent<"login" | "logout">) => {
      if (e.data === "logout") apply(null);
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
      apply(s);
      channelRef.current?.postMessage("login");
      return s.user;
    },
    [apply],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const s = await postAuth("register", { email, password, displayName });
      apply(s);
      channelRef.current?.postMessage("login");
      return s.user;
    },
    [apply],
  );

  const logout = useCallback(async () => {
    const cur = stateRef.current;
    const token = cur.status === "authenticated" ? cur.session.accessToken : null;
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } finally {
      apply(null);
      channelRef.current?.postMessage("logout");
    }
  }, [apply]);

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
        token = apply(await refreshSession().catch(() => null))?.accessToken ?? null;
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
        token = apply(await refreshSession().catch(() => null))?.accessToken ?? null;
      }
      if (!token) throw new ApiError("UNAUTHENTICATED", "not signed in");
      try {
        return await run(token);
      } catch (err) {
        const e = toApiError(err);
        if (e.code !== "UNAUTHENTICATED") throw e;
        const s = apply(await refreshSession().catch(() => null));
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
      changePassword,
      reload,
      request,
    }),
    [state, login, register, logout, changePassword, reload, request],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
