import type { MetadataRoute } from "next";
import { SITEMAP_COFFEES, SITEMAP_SHOPS } from "@/lib/api";
import { query } from "@/lib/graphql";
import { pageOffsets, siteBase, sitemapEntries } from "@/lib/sitemap";

// Built per request from live data (catalogue changes often in Stage 1).
export const dynamic = "force-dynamic";

const PAGE = 100; // the API's max page size
const MAX_PER_KIND = 20_000; // one sitemap file holds 50,000 URLs

async function collect<T>(
  fetchPage: (offset: number) => Promise<{ total: number; nodes: T[] }>,
  pick: (n: T) => string,
): Promise<string[]> {
  const first = await fetchPage(0);
  const rest = await Promise.all(pageOffsets(first.total, PAGE, MAX_PER_KIND).slice(1).map(fetchPage));
  return [first, ...rest].flatMap((p) => p.nodes.map(pick));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBase(process.env.SITE_URL);
  let shops: string[] = [];
  let coffees: string[] = [];
  try {
    [shops, coffees] = await Promise.all([
      collect(async (offset) => (await query(SITEMAP_SHOPS, { limit: PAGE, offset })).shops, (s) => s.slug),
      collect(async (offset) => (await query(SITEMAP_COFFEES, { limit: PAGE, offset })).coffees, (c) => c.id),
    ]);
  } catch (err) {
    // API down: still serve the static pages rather than an error.
    console.error("sitemap: catalogue fetch failed", err);
  }
  return sitemapEntries(base, shops, coffees);
}
