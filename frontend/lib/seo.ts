// Share-card (Open Graph / Twitter) and canonical metadata for detail pages.
// Pure, no imports, so `npm test` can load it; pages pass the result to Next's
// generateMetadata.

export type ShareLocale = "zh-TW" | "en";

export interface ShareInput {
  /** Public origin from siteBase(SITE_URL), no trailing slash. */
  base: string;
  /** Path of the page, starting with "/". */
  path: string;
  title: string;
  description: string;
  /** Candidate images, best first (absolute bucket URLs or site-relative paths). */
  images: (string | null | undefined)[];
  locale: ShareLocale;
  type?: "website" | "article";
}

const OG_LOCALE: Record<ShareLocale, string> = { "zh-TW": "zh_TW", en: "en_US" };

/** Absolute http(s) URL for `src` against `base`, or null for anything else. */
export function absoluteUrl(src: string, base: string): string | null {
  try {
    const u = new URL(src, base + "/");
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Description for cards: whitespace collapsed, cut at 160 characters with an ellipsis. */
export function shareDescription(text: string, max = 160): string {
  const s = text.replace(/\s+/g, " ").trim();
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, max - 1).join("").trimEnd() + "…";
}

export function shareMetadata(i: ShareInput) {
  const url = absoluteUrl(i.path, i.base) ?? i.base;
  const image = i.images.map((s) => (s ? absoluteUrl(s, i.base) : null)).find((s) => s !== null) ?? null;
  const description = shareDescription(i.description);
  const other: ShareLocale = i.locale === "en" ? "zh-TW" : "en";
  return {
    description,
    alternates: { canonical: url },
    openGraph: {
      type: i.type ?? "website",
      siteName: "MONI CAFE",
      url,
      title: i.title,
      description,
      locale: OG_LOCALE[i.locale],
      alternateLocale: [OG_LOCALE[other]],
      ...(image ? { images: [{ url: image, alt: i.title }] } : {}),
    },
    twitter: {
      card: image ? ("summary_large_image" as const) : ("summary" as const),
      title: i.title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
