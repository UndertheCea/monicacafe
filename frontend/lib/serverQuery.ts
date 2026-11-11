// query() for server components and other server-side renders.
import { headers } from "next/headers";
import { clientAddress } from "./auth/token";
import { forwardingClient, query, type TypedDocument } from "./graphql";

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
