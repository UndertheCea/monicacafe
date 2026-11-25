/** How long a server-side GraphQL fetch may take before it is aborted (#529). */
export const SERVER_FETCH_TIMEOUT_MS = 8000;

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

/**
 * Wraps `base` so every request carries `AbortSignal.timeout(ms)`, combined with
 * the caller's own signal (AbortSignal.any) when there is one. A hung backend then
 * fails the request with a TimeoutError instead of hanging SSR for ever; toApiError
 * turns that into UNAVAILABLE.
 */
export function withTimeout(base: FetchLike, ms: number = SERVER_FETCH_TIMEOUT_MS): FetchLike {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return base(input, { ...init, signal });
  };
}

/** fetch with the server-side timeout; looks `fetch` up per call so tests and Next's patching still apply. */
export const timeoutFetch: FetchLike = (input, init) => withTimeout(fetch)(input, init);
