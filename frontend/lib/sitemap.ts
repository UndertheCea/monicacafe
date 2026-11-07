// Pure helpers for app/sitemap.ts and app/robots.ts.

export const DEFAULT_SITE_URL = "http://localhost";

/** Public origin of the site from SITE_URL: trimmed, no trailing slash, http(s) only. */
export function siteBase(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return DEFAULT_SITE_URL;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return DEFAULT_SITE_URL;
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Offsets for walking a paged list of `total` items, `size` at a time, capped at `maxItems`. */
export function pageOffsets(total: number, size: number, maxItems: number): number[] {
  const out: number[] = [];
  const end = Math.min(Math.max(0, total), maxItems);
  for (let o = 0; o < end; o += size) out.push(o);
  return out;
}

export interface SitemapEntry {
  url: string;
  changeFrequency: "daily" | "weekly";
  priority: number;
  /** ISO 8601; only for shop and coffee pages, from the API's updatedAt. */
  lastModified?: string;
}

export interface SitemapShop {
  slug: string;
  updatedAt: string;
}

export interface SitemapCoffee {
  id: string;
  updatedAt: string;
  shop: { slug: string };
}

/** The later of two ISO timestamps; an unparseable value loses (both bad → undefined). */
export function laterDate(a: string | undefined, b: string | undefined): string | undefined {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return undefined;
  if (Number.isNaN(tb) || ta >= tb) return new Date(ta).toISOString();
  return new Date(tb).toISOString();
}

const STATIC_PATHS: [string, SitemapEntry["changeFrequency"], number][] = [
  ["/", "daily", 1],
  ["/coffees", "daily", 0.9],
  ["/shops", "daily", 0.8],
  ["/map", "weekly", 0.5],
];

/**
 * Sitemap entries for the public pages, every shop and every published coffee.
 * Slugs and ids are URL-encoded; duplicates are dropped. A coffee's lastmod is
 * its updatedAt (which follows its options too); a shop's is the later of its
 * own and its listed coffees', because the shop page shows those coffees.
 */
export function sitemapEntries(base: string, shops: SitemapShop[], coffees: SitemapCoffee[]): SitemapEntry[] {
  const shopLatest = new Map<string, string | undefined>();
  for (const s of shops) shopLatest.set(s.slug, laterDate(shopLatest.get(s.slug), s.updatedAt));
  for (const c of coffees) {
    if (shopLatest.has(c.shop.slug)) shopLatest.set(c.shop.slug, laterDate(shopLatest.get(c.shop.slug), c.updatedAt));
  }

  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  const add = (path: string, changeFrequency: SitemapEntry["changeFrequency"], priority: number, lastModified?: string) => {
    const url = base + path;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(lastModified ? { url, changeFrequency, priority, lastModified } : { url, changeFrequency, priority });
  };
  for (const [p, f, pr] of STATIC_PATHS) add(p, f, pr);
  for (const s of shops) add(`/shops/${encodeURIComponent(s.slug)}`, "weekly", 0.7, shopLatest.get(s.slug));
  for (const c of coffees) add(`/coffees/${encodeURIComponent(c.id)}`, "weekly", 0.6, laterDate(c.updatedAt, undefined));
  return out;
}
