// Share-card (Open Graph / Twitter) and canonical metadata for the public pages.
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
      siteName: "Moni Cafe",
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

/**
 * Canonical path of a listing page (/coffees, /shops): filters, sort and search are dropped so every
 * combination points at one URL; only the page number is kept (page 1 = the bare path) (#195).
 */
export function listingCanonicalPath(base: string, page: number): string {
  const n = Number.isSafeInteger(page) && page > 1 ? page : 1;
  return n > 1 ? `${base}?page=${n}` : base;
}

/** Keyword-search results aren't worth indexing, but their links are: `noindex, follow` when `q` is set. */
export function listingRobots(q: string | null | undefined): { index: false; follow: true } | undefined {
  return q && q.trim() ? { index: false, follow: true } : undefined;
}

// ---------------------------------------------------------------------------
// schema.org structured data (JSON-LD)
// ---------------------------------------------------------------------------

export interface JsonLdCoffee {
  id: string;
  name: string;
  description: string;
  imageUrls: string[];
  shop: { name: string };
  variants: { priceTwd: number; stock: number; isAvailable: boolean }[];
  /** provenanceFacts(coffee) from lib/provenance (passed in to keep this file import-free). */
  provenance?: [ProvenanceKey, string][];
  /** FILTER | ESPRESSO | OMNI; null / unknown is left out. */
  brewMethod?: string | null;
  /** The crop year; null or out of range (2000–2100) is left out. */
  harvestYear?: number | null;
}

/** English values for the "Roasted for" property (JSON-LD isn't localised). */
const BREW_VALUES: Record<string, string> = {
  FILTER: "Filter",
  ESPRESSO: "Espresso",
  OMNI: "Filter and espresso",
};

type ProvenanceKey = "coffee.producer" | "coffee.region" | "coffee.altitude";

const PROVENANCE_NAMES: Record<ProvenanceKey, string> = {
  "coffee.producer": "Producer",
  "coffee.region": "Region",
  "coffee.altitude": "Altitude",
};

/**
 * A schema.org Product for a published coffee. The offer covers the options a
 * buyer can pick (available ones); it's InStock when any of them has stock.
 * No variants → no offer. Producer / region / altitude, the brew method and the
 * harvest year, when set, become additionalProperty PropertyValues.
 */
export function coffeeJsonLd(c: JsonLdCoffee, base: string): Record<string, unknown> {
  const url = absoluteUrl(`/coffees/${c.id}`, base) ?? base;
  const images = c.imageUrls.map((s) => absoluteUrl(s, base)).filter((s): s is string => s !== null);
  const available = c.variants.filter((v) => v.isAvailable);
  const priced = available.length > 0 ? available : c.variants;
  const prices = priced.map((v) => v.priceTwd).filter((p) => Number.isInteger(p) && p > 0);
  const inStock = available.some((v) => v.stock > 0);

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    url,
    sku: c.id,
    name: c.name,
    brand: { "@type": "Brand", name: c.shop.name },
  };
  const description = shareDescription(c.description, 500);
  if (description) ld.description = description;
  if (images.length > 0) ld.image = images;
  const props: Record<string, string | number>[] = (c.provenance ?? [])
    .filter(([key, value]) => key in PROVENANCE_NAMES && value.trim() !== "")
    .map(([key, value]) => ({ "@type": "PropertyValue", name: PROVENANCE_NAMES[key], value }));
  const brew = c.brewMethod ? BREW_VALUES[c.brewMethod] : undefined;
  if (brew) props.push({ "@type": "PropertyValue", name: "Roasted for", value: brew });
  const harvest = c.harvestYear;
  if (typeof harvest === "number" && Number.isInteger(harvest) && harvest >= 2000 && harvest <= 2100) {
    props.push({ "@type": "PropertyValue", name: "Harvest year", value: String(harvest) });
  }
  if (props.length > 0) ld.additionalProperty = props;
  if (prices.length > 0) {
    ld.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "TWD",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: prices.length,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
    };
  }
  return ld;
}

export interface JsonLdShop {
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  city: string;
  lat?: number | null;
  lng?: number | null;
}

/**
 * A schema.org Store for a shop page: name, description, images, the city as
 * its locality in Taiwan, coordinates when the seller set valid ones, and an
 * OfferCatalog naming the coffees passed in (the ones listed on the page; pass
 * none to leave the catalogue out, e.g. on a filtered list).
 */
export function shopJsonLd(s: JsonLdShop, coffees: { id: string; name: string }[], base: string): Record<string, unknown> {
  const url = absoluteUrl(`/shops/${encodeURIComponent(s.slug)}`, base) ?? base;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": url,
    url,
    name: s.name,
    address: {
      "@type": "PostalAddress",
      addressCountry: "TW",
      ...(s.city ? { addressLocality: s.city } : {}),
    },
  };
  const description = shareDescription(s.description, 500);
  if (description) ld.description = description;
  const logo = s.logoUrl ? absoluteUrl(s.logoUrl, base) : null;
  if (logo) ld.logo = logo;
  const images = [s.bannerUrl, s.logoUrl].map((src) => (src ? absoluteUrl(src, base) : null)).filter((x): x is string => x !== null);
  if (images.length > 0) ld.image = images;
  const { lat, lng } = s;
  if (
    typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  ) {
    ld.geo = { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
  }
  if (coffees.length > 0) {
    ld.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: s.name,
      itemListElement: coffees.map((c, i) => {
        const href = absoluteUrl(`/coffees/${encodeURIComponent(c.id)}`, base) ?? base;
        return {
          "@type": "Offer",
          position: i + 1,
          url: href,
          itemOffered: { "@type": "Product", "@id": href, name: c.name, url: href },
        };
      }),
    };
  }
  return ld;
}

/**
 * JSON for a <script type="application/ld+json"> body. `<`, `>` and `&` are
 * escaped so seller text can never close the script element or open a
 * comment, and U+2028/U+2029 so the output is also valid JavaScript.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
