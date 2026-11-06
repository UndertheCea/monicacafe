import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

// Next 16 "proxy" (formerly middleware). Sets a per-request nonce'd Content-Security-Policy. Next reads the policy
// from the *request* headers and puts the nonce on its own <script> tags, so
// pages render dynamically (they already do: everything is ƒ).
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    graphqlUrl: process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql",
    mediaUrl: process.env.NEXT_PUBLIC_MEDIA_URL ?? "http://localhost/media",
  });

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip static assets, the auth route handlers and prefetches.
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
