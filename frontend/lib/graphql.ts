import { ClientError, GraphQLClient } from "graphql-request";
import { UNAVAILABLE, parseGraphQLErrors, rateLimitedFromStatus } from "./errors";

import { browserGraphqlUrl, serverGraphqlUrl } from "./endpoint";

// Server code talks to the backend directly (GRAPHQL_URL_INTERNAL, e.g.
// http://backend:4000/graphql inside docker compose); the browser calls
// /graphql on the page's own origin, behind nginx (lib/endpoint.ts, #210).
const env = {
  nodeEnv: process.env.NODE_ENV,
  publicUrl: process.env.NEXT_PUBLIC_GRAPHQL_URL,
  internalUrl: process.env.GRAPHQL_URL_INTERNAL,
};
const endpoint = typeof window === "undefined" ? serverGraphqlUrl(env) : browserGraphqlUrl(env, window.location.origin);

export const gqlClient = new GraphQLClient(endpoint, {
  credentials: "include",
  // Catalogue data changes often in Stage 1; never serve stale lists.
  cache: "no-store",
});

/** Server-side client that passes the visitor's address on as X-Forwarded-For (for the API's per-IP limits). */
export function forwardingClient(xff: string | undefined) {
  if (!xff) return gqlClient;
  return new GraphQLClient(endpoint, { headers: { "X-Forwarded-For": xff }, cache: "no-store" });
}

/**
 * Client for anonymous catalogue queries that may be cached for a minute
 * (lib/catalogueCache.ts). It sends no cookies, no Authorization and no
 * per-visitor headers: Next keys its fetch cache on headers, so anything
 * per-visitor would defeat the cache (and a viewer's token must never be
 * attached to a response that is shared).
 */
export function cachedClient(next: { revalidate: number; tags: string[] }) {
  return new GraphQLClient(endpoint, { next });
}

export function authedClient(accessToken: string) {
  return new GraphQLClient(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
    cache: "no-store",
  });
}

/** A GraphQL document string tagged with its result and variable types. */
export type TypedDocument<TData, TVars extends Record<string, unknown>> = string & {
  readonly __types?: { data: TData; vars: TVars };
};

export function typed<TData, TVars extends Record<string, unknown> = Record<string, never>>(
  doc: string,
): TypedDocument<TData, TVars> {
  return doc as TypedDocument<TData, TVars>;
}

export async function query<TData, TVars extends Record<string, unknown>>(
  doc: TypedDocument<TData, TVars>,
  vars?: TVars,
  client: GraphQLClient = gqlClient,
): Promise<TData> {
  return client.request<TData>(doc, vars);
}

/**
 * A failed API call. `code` is a backend code (see API_ERROR_CODES in
 * lib/errors.ts) or UNAVAILABLE when the server couldn't be reached;
 * `message` is English, for logs only — show t() messages chosen by code.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public field?: string,
    /** Seconds to wait, on RATE_LIMITED errors. */
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/** Normalise any thrown value into an ApiError (network errors → UNAVAILABLE). */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ClientError) {
    // nginx's own 429 has no JSON body, so no `errors` to read (#214).
    const limited = err.response.errors ? undefined : rateLimitedFromStatus(err.response.status, err.response.headers?.get("retry-after"));
    if (limited) return new ApiError(limited.code, limited.message, undefined, limited.retryAfter);
    const f = parseGraphQLErrors(err.response.errors);
    return new ApiError(f.code, f.message, f.field, f.retryAfter);
  }
  return unavailable();
}

/** The error for "couldn't reach the server". */
export const unavailable = () => new ApiError(UNAVAILABLE, "could not reach the server");
