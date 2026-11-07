import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // No "X-Powered-By: Next.js" (nginx hides its version the same way).
  poweredByHeader: false,
  // No `images.remotePatterns`: nothing uses next/image (seller images are
  // plain <img> tags served from our own bucket), and a "**" wildcard turned
  // the image optimizer into an open proxy (GHSA-9g9p-9gw9-jx7f). If next/image
  // is adopted, list only the NEXT_PUBLIC_MEDIA_URL host. Image, script and
  // connect origins are pinned by the Content-Security-Policy (proxy.ts).
};

export default nextConfig;
