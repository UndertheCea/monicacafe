/**
 * Retrying a client-side load (#437). A panel keeps a counter in its load effect's deps: bumping it re-runs the
 * load, so "Try again" and a repeated search submit refetch without a page reload.
 */
export function nextLoadKey(key: number): number {
  return key + 1;
}

/**
 * A search submit always refetches: the same query again is a deliberate refresh, so the load key always
 * advances; the query is only the new value to search for.
 */
export function submitSearch(current: { query: string; key: number }, q: string): { query: string; key: number } {
  return { query: q, key: nextLoadKey(current.key) };
}

/**
 * The viewer's own state behind a toggle (Save, Follow), fetched after sign-in (#443). Only "ready" enables
 * the toggle: a failed load must not leave it showing "not saved" / "not following" as if that were known.
 */
export type OwnStateLoad = "loading" | "ready" | "failed";

export function ownStateAfterLoad(ok: boolean): OwnStateLoad {
  return ok ? "ready" : "failed";
}

/**
 * The viewer's own save / follow state is only known while signed in: once the
 * session goes away the next sign-in must fetch it again, so the toggle waits
 * for that instead of acting on the state from before the sign-out (#470).
 */
export function ownStateOnStatus(load: OwnStateLoad, status: "loading" | "anonymous" | "authenticated"): OwnStateLoad {
  return status === "authenticated" ? load : "loading";
}

export function toggleEnabled(load: OwnStateLoad, busy: boolean): boolean {
  return load === "ready" && !busy;
}
