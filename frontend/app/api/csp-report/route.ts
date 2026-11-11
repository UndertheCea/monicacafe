// Receives CSP violation reports (report-uri / report-to, see lib/csp.ts) and
// logs one JSON line each. Rate-limited by nginx's /api/ location.
import { NextResponse, type NextRequest } from "next/server";
import { MAX_REPORT_BYTES, isReportContentType, summariseReports } from "@/lib/cspReport";

export const dynamic = "force-dynamic";

const empty = (status: number) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (!isReportContentType(req.headers.get("content-type"))) return empty(415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REPORT_BYTES) return empty(413);
  const body = await req.text();
  if (body.length > MAX_REPORT_BYTES) return empty(413);
  for (const r of summariseReports(body)) console.log(JSON.stringify({ msg: "csp-violation", ...r }));
  return empty(204);
}
