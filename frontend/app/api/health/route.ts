// GET /api/health: the build id and whether the API answered (#221). The
// frontend's own container healthcheck stays on /robots.txt (it must not flap
// with the API); this route is for an external uptime check through nginx.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { serverGraphqlUrl } from "@/lib/endpoint";
import { apiReadyUrl, healthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";

let build: string | undefined;

/** `next build` writes its build id to .next/BUILD_ID (next.config.ts sets it from SOURCE_COMMIT when given). */
function buildId(): string {
  if (build === undefined) {
    try {
      build = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    } catch {
      build = "";
    }
  }
  return build;
}

export async function GET() {
  let apiReady = false;
  try {
    const url = apiReadyUrl(
      serverGraphqlUrl({ internalUrl: process.env.GRAPHQL_URL_INTERNAL, publicUrl: process.env.NEXT_PUBLIC_GRAPHQL_URL }),
    );
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    apiReady = res.ok;
  } catch {
    // timeout or connection refused: the API is down
  }
  const { status, body } = healthResponse(buildId(), apiReady);
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
