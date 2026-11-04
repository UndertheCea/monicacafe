import { ClientError, GraphQLClient } from "graphql-request";

// Server components talk to the backend directly (GRAPHQL_URL_INTERNAL, e.g.
// http://backend:4000/graphql inside docker compose); the browser uses the
// public URL behind nginx.
const publicEndpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";
const endpoint =
  typeof window === "undefined"
    ? (process.env.GRAPHQL_URL_INTERNAL ?? publicEndpoint)
    : publicEndpoint;

export const gqlClient = new GraphQLClient(endpoint, {
  credentials: "include",
  // Catalogue data changes often in Stage 1; never serve stale lists.
  cache: "no-store",
});

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

/** Structured error mirroring the backend's apperr extensions. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public messageZh: string,
    public messageEn: string,
  ) {
    super(messageEn);
  }
}

/** Normalise any thrown value into an ApiError (network errors → UNAVAILABLE). */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ClientError) {
    const ext = err.response.errors?.[0]?.extensions as
      | { code?: string; messageZh?: string; messageEn?: string }
      | undefined;
    const fallback = err.response.errors?.[0]?.message ?? "GraphQL error";
    return new ApiError(ext?.code ?? "INTERNAL", ext?.messageZh ?? fallback, ext?.messageEn ?? fallback);
  }
  return new ApiError("UNAVAILABLE", "無法連線至伺服器", "Could not reach the server");
}
