import { NextResponse, type NextRequest } from "next/server";
import { REPORTING_ENDPOINTS, buildCsp, buildPermissionsPolicy } from "@/lib/csp";
import { DEV_GRAPHQL_URL } from "@/lib/endpoint";

// Next 16 "proxy" (formerly middleware). Sets a per-request nonce'd Content-Security-Policy. Next reads the policy
// from the *request* headers and puts the nonce on its own <script> tags, so
// pages render dynamically (they already do: everything is ƒ).
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === "development";
  const csp = buildCsp({
    nonce,
    dev,
    // Same origin ('self') unless overridden; `next dev` has no nginx in front.
    graphqlUrl: process.env.NEXT_PUBLIC_GRAPHQL_URL || (dev ? DEV_GRAPHQL_URL : "/graphql"),
    // Read per request, not at build time (#210): only needed when images come
    // from another origin (a CDN; = the API's MEDIA_PUBLIC_URL). Unset, uploads
    // and images are same-origin under /media/ and 'self' covers them.
    siteUrl: process.env.SITE_URL,
    mediaUrl: process.env.MEDIA_URL || (dev ? "http://localhost/media" : ""),
  });

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", buildPermissionsPolicy());
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip static assets, the auth route handlers and prefetches.
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
