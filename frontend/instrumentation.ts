import { buildEnvelope, parseDsn } from "@/lib/errorReport";

// Next calls onRequestError for every error thrown while rendering on the
// server (server components, route handlers, the proxy). With SENTRY_DSN set,
// the error is posted to the Sentry-compatible endpoint; unset, this does
// nothing. Server-side only: the browser never learns the DSN (#221).
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routeType?: string },
): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const e = (err ?? {}) as { name?: string; message?: string; stack?: string; digest?: string };
  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=moni-web/1, sentry_key=${dsn.key}`,
      },
      body: buildEnvelope({
        error: { name: e.name, message: e.message, stack: e.stack, digest: e.digest },
        method: request.method,
        path: request.path,
        routeType: context.routeType,
        environment: process.env.APP_ENV || process.env.NODE_ENV,
        release: process.env.SENTRY_RELEASE || undefined,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Reporting must never break a request; the error is already in the server log.
  }
}
