// query() for server components and other server-side renders.
import { headers } from "next/headers";
import { clientAddress } from "./auth/token";
import { cachedClient, forwardingClient, query, type TypedDocument } from "./graphql";
import { catalogueFetchOptions, type CatalogueTag } from "./catalogueCache";

/**
 * Run an anonymous query from the server, passing the visitor's address on
 * (nginx's X-Real-IP; see clientAddress).
 * The API limits requests per client IP (RATE_LIMIT_GRAPHQL_IP): without this
 * every page render would count against this server's own address, and all
 * visitors would share one budget.
 */
export async function serverQuery<TData, TVars extends Record<string, unknown>>(
  doc: TypedDocument<TData, TVars>,
  vars?: TVars,
): Promise<TData> {
  let xff: string | undefined;
  try {
    xff = clientAddress((await headers()).get("x-real-ip"));
  } catch {
    // Not inside a request (e.g. a build-time render): nothing to pass on.
  }
  return query(doc, vars, forwardingClient(xff));
}

/**
 * An anonymous catalogue query whose answer is shared for CATALOGUE_REVALIDATE
 * seconds (#235). Use only for data that is the same for everyone. Because the
 * request carries nothing per-visitor it counts against this server's own
 * address in the API's per-IP limit, which is fine at one request per minute.
 */
export function cachedServerQuery<TData, TVars extends Record<string, unknown>>(
  doc: TypedDocument<TData, TVars>,
  tags: CatalogueTag[],
  vars?: TVars,
): Promise<TData> {
  return query(doc, vars, cachedClient(catalogueFetchOptions(tags)));
}
