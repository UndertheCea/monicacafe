import type { MetadataRoute } from "next";
import { SITEMAP_COFFEES, SITEMAP_SHOPS } from "@/lib/api";
import { serverQuery } from "@/lib/serverQuery";
import { pageOffsets, siteBase, sitemapEntries, type SitemapCoffee, type SitemapShop } from "@/lib/sitemap";

// Built per request from live data (catalogue changes often in Stage 1).
export const dynamic = "force-dynamic";

const PAGE = 100; // the API's max page size
const MAX_PER_KIND = 20_000; // one sitemap file holds 50,000 URLs

async function collect<T>(fetchPage: (offset: number) => Promise<{ total: number; nodes: T[] }>): Promise<T[]> {
  const first = await fetchPage(0);
  const rest = await Promise.all(pageOffsets(first.total, PAGE, MAX_PER_KIND).slice(1).map(fetchPage));
  return [first, ...rest].flatMap((p) => p.nodes);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBase(process.env.SITE_URL);
  let shops: SitemapShop[] = [];
  let coffees: SitemapCoffee[] = [];
  try {
    [shops, coffees] = await Promise.all([
      collect(async (offset) => (await serverQuery(SITEMAP_SHOPS, { limit: PAGE, offset })).shops),
      collect(async (offset) => (await serverQuery(SITEMAP_COFFEES, { limit: PAGE, offset })).coffees),
    ]);
  } catch (err) {
    // API down: still serve the static pages rather than an error.
    console.error("sitemap: catalogue fetch failed", err);
  }
  return sitemapEntries(base, shops, coffees);
}
