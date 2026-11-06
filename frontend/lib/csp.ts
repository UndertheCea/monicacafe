// Content-Security-Policy for every page (set by proxy.ts). No imports:
// `node --test` loads this directly.

/** Map tiles used by components/map (OSM for the demo; see question #10). */
export const MAP_TILE_ORIGIN = "https://tile.openstreetmap.org";

export interface CspOptions {
  /** Per-request nonce; Next adds it to its own <script> tags. */
  nonce: string;
  /** `next dev` needs eval for React Refresh and fast-refresh websockets. */
  dev: boolean;
  /** Browser-side GraphQL endpoint (NEXT_PUBLIC_GRAPHQL_URL). */
  graphqlUrl: string;
  /** Where uploaded images are served from and PUT to (NEXT_PUBLIC_MEDIA_URL). */
  mediaUrl: string;
}

/** Origin of an absolute http(s) URL, or null for relative / invalid ones. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export function buildCsp({ nonce, dev, graphqlUrl, mediaUrl }: CspOptions): string {
  const media = originOf(mediaUrl);
  const api = originOf(graphqlUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets Next's nonce'd bootstrap load its chunks (and the
    // lazily imported Leaflet); hosts are ignored by CSP3 browsers.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // React and Leaflet set inline style attributes; Next injects <style> in dev.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": uniq(["'self'", "data:", "blob:", media, MAP_TILE_ORIGIN]),
    "font-src": ["'self'"],
    // GraphQL, the /api/auth route handlers (same origin) and presigned uploads.
    "connect-src": uniq(["'self'", api, media, ...(dev ? ["ws:", "wss:"] : [])]),
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}
