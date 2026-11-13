// Payload of GET /api/health (#221). No imports: `node --test` loads this file directly.

/** The API's readiness URL, derived from the GraphQL URL the server already uses (http://backend:4000/graphql -> http://backend:4000/health/ready). */
export function apiReadyUrl(graphqlUrl: string): string {
  return new URL("/health/ready", graphqlUrl).href;
}

export interface HealthBody {
  status: "ok" | "degraded";
  build: string;
  api: "up" | "down";
}

/** The response: 200 when the API answered ready, 503 when it did not. The frontend itself is up either way. */
export function healthResponse(build: string, apiReady: boolean): { status: number; body: HealthBody } {
  return {
    status: apiReady ? 200 : 503,
    body: { status: apiReady ? "ok" : "degraded", build: build || "unknown", api: apiReady ? "up" : "down" },
  };
}
