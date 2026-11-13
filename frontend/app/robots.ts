import type { MetadataRoute } from "next";
import { siteBase } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteBase(process.env.SITE_URL);
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/account", "/admin", "/api/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
