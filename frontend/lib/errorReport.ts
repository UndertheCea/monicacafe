// Server-side error reporting for the Next.js server (#221): a minimal
// Sentry-compatible envelope builder, used by instrumentation.ts. No imports:
// `node --test` loads this file directly.
//
// Reporting is server-side only. Errors thrown while rendering on the server
// reach instrumentation's onRequestError; the browser never gets the DSN, so
// the Content-Security-Policy's connect-src does not change. (Errors that only
// happen in the browser are not reported; error.tsx shows the visitor a
// reference digest instead.)

export interface Dsn {
  /** Envelope URL, e.g. https://host/api/42/envelope/ */
  endpoint: string;
  key: string;
}

/** Parses https://<key>@<host>[/<prefix>]/<project id>; null for empty or invalid values. */
export function parseDsn(raw: string | undefined): Dsn | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.host || !u.username) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const project = parts.pop() ?? "";
  if (!/^\d+$/.test(project)) return null;
  const prefix = parts.length ? `${parts.join("/")}/` : "";
  return { endpoint: `${u.protocol}//${u.host}/${prefix}api/${project}/envelope/`, key: u.username };
}

const SCRUBBERS: [RegExp, string][] = [
  [/postgres(?:ql)?:\/\/\S+/g, "[dsn]"],
  [/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]"],
  [/(password|passwd|secret|token|authorization|cookie|api[_-]?key|dsn)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1$2[redacted]"],
  [/[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi, "[email]"],
  [/\b[A-Fa-f0-9]{40,}\b/g, "[hex]"],
];

/** Removes emails, tokens, JWTs, password assignments, database URLs and long hex keys from free text. */
export function scrub(text: string): string {
  return SCRUBBERS.reduce((s, [re, repl]) => s.replace(re, repl), text);
}

/** The URL path without its query string or fragment (query strings can carry tokens). */
export function pathOnly(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export interface ReportInput {
  error: { name?: string; message?: string; stack?: string; digest?: string };
  method?: string;
  /** Request path; any query string is dropped. */
  path?: string;
  /** "Server Component", "Route Handler", ... (Next's routerKind / routeType). */
  routeType?: string;
  environment?: string;
  release?: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function hexId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds the envelope body (three JSON lines). No user, headers, cookies or body are included. */
export function buildEnvelope(input: ReportInput, now: Date = new Date()): string {
  const eventId = hexId();
  const ts = now.toISOString().replace(/\.\d+Z$/, "Z");
  const tags: Record<string, string> = {};
  if (input.routeType) tags.route_type = scrub(clip(input.routeType, 64));
  if (input.error.digest) tags.digest = scrub(clip(input.error.digest, 64));
  const event: Record<string, unknown> = {
    event_id: eventId,
    timestamp: ts,
    platform: "node",
    level: "error",
    logger: "moni-web",
    environment: input.environment ?? "",
    tags,
    exception: {
      values: [
        {
          type: scrub(clip(input.error.name || "Error", 100)),
          value: clip(scrub(input.error.message ?? ""), 2000),
        },
      ],
    },
  };
  if (input.release) event.release = input.release;
  if (input.method || input.path) {
    event.request = { method: input.method ?? "", url: scrub(clip(pathOnly(input.path ?? ""), 200)) };
  }
  if (input.error.stack) event.extra = { stack: clip(scrub(input.error.stack), 8000) };
  return [
    JSON.stringify({ event_id: eventId, sent_at: ts }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n") + "\n";
}
