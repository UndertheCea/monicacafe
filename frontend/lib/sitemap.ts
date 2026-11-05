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
}

const STATIC_PATHS: [string, SitemapEntry["changeFrequency"], number][] = [
  ["/", "daily", 1],
  ["/coffees", "daily", 0.9],
  ["/shops", "daily", 0.8],
  ["/map", "weekly", 0.5],
];

/**
 * Sitemap entries for the public pages, every shop and every published coffee.
 * Slugs and ids are URL-encoded; duplicates are dropped.
 */
export function sitemapEntries(base: string, shopSlugs: string[], coffeeIds: string[]): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  const add = (path: string, changeFrequency: SitemapEntry["changeFrequency"], priority: number) => {
    const url = base + path;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, changeFrequency, priority });
  };
  for (const [p, f, pr] of STATIC_PATHS) add(p, f, pr);
  for (const s of shopSlugs) add(`/shops/${encodeURIComponent(s)}`, "weekly", 0.7);
  for (const id of coffeeIds) add(`/coffees/${encodeURIComponent(id)}`, "weekly", 0.6);
  return out;
}
