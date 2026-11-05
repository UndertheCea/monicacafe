import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // No `images.remotePatterns`: nothing uses next/image yet (seller images are
  // plain <img> tags), and a "**" wildcard turned the image optimizer into an
  // open proxy (GHSA-9g9p-9gw9-jx7f). Add specific hosts once uploads land.
};

export default nextConfig;
