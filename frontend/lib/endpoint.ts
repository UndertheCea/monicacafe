// Where the GraphQL API is, for the browser and for the server (#210). No
// imports: `node --test` loads this file directly.
//
// Nothing host-specific is baked into a production build: the browser calls
// /graphql on whatever origin served the page (nginx routes it to the API),
// so one image works on http://localhost, http://localhost:8080 or a real
// domain without a rebuild.

/** `next dev` without nginx: the API's own port. */
export const DEV_GRAPHQL_URL = "http://localhost:4000/graphql";
/** Same-origin path nginx forwards to the API. */
export const GRAPHQL_PATH = "/graphql";

export interface EndpointEnv {
  /** process.env.NODE_ENV ("production" in `next build` / `next start`). */
  nodeEnv?: string;
  /** NEXT_PUBLIC_GRAPHQL_URL: optional override, inlined at build time. */
  publicUrl?: string;
  /** GRAPHQL_URL_INTERNAL: how the Next server reaches the API (compose: http://backend:4000/graphql). */
  internalUrl?: string;
}

const clean = (v: string | undefined) => (v ?? "").trim();

/**
 * The URL the browser posts GraphQL requests to: the override when one is set,
 * else /graphql on the page's own origin, except under `next dev`, which runs
 * without nginx in front and so talks to the API's port directly. `origin` is
 * window.location.origin; graphql-request needs an absolute URL.
 */
export function browserGraphqlUrl(env: EndpointEnv, origin: string): string {
  const override = clean(env.publicUrl);
  if (override) return new URL(override, origin).href;
  if (env.nodeEnv === "development") return DEV_GRAPHQL_URL;
  return new URL(GRAPHQL_PATH, origin).href;
}

/**
 * The URL server code (server components, the auth route handlers) uses:
 * GRAPHQL_URL_INTERNAL, else an absolute override, else the API on localhost.
 * A relative override can't be used here: the server has no page origin.
 */
export function serverGraphqlUrl(env: EndpointEnv): string {
  const internal = clean(env.internalUrl);
  if (internal) return internal;
  const override = clean(env.publicUrl);
  if (/^https?:\/\//i.test(override)) return override;
  return DEV_GRAPHQL_URL;
}
