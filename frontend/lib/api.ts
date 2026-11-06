// Typed queries against backend/graph/schema.graphqls. Keep these types in
// sync with the schema (a codegen step can replace them later).
import { typed } from "./graphql";
import { COMMENTS_PAGE } from "./comments";
import type { CoffeeSort } from "./coffeeQuery";

export type RoastLevel = "LIGHT" | "MEDIUM" | "MEDIUM_DARK" | "DARK";
export const ROAST_LEVELS: RoastLevel[] = ["LIGHT", "MEDIUM", "MEDIUM_DARK", "DARK"];

export interface OriginCountry {
  id: string;
  nameEn: string;
  nameZh: string;
  region: string;
}
export interface CoffeeVariety {
  id: string;
  name: string;
}
export interface ProcessingMethod {
  id: string;
  nameEn: string;
  nameZh: string;
}

export interface CoffeeFilter {
  originCountryId?: string;
  varietyId?: string;
  processingMethodId?: string;
  roastLevel?: RoastLevel;
  flavorNote?: string;
  minPriceTwd?: number;
  maxPriceTwd?: number;
  inStock?: boolean;
}

export interface CoffeeCardData {
  id: string;
  slug: string;
  name: string;
  roastLevel: RoastLevel;
  flavorNotes: string[];
  imageUrls: string[];
  commentCount: number;
  shop: { slug: string; name: string; city: string };
  originCountry: { nameEn: string; nameZh: string };
  processingMethod: { nameEn: string; nameZh: string };
  variety: { name: string } | null;
  variants: { priceTwd: number; isAvailable: boolean }[];
}

export const FILTER_OPTIONS = typed<{
  originCountries: OriginCountry[];
  coffeeVarieties: CoffeeVariety[];
  processingMethods: ProcessingMethod[];
}>(/* GraphQL */ `
  query FilterOptions {
    originCountries { id nameEn nameZh region }
    coffeeVarieties { id name }
    processingMethods { id nameEn nameZh }
  }
`);

export const COFFEES = typed<
  { coffees: { total: number; nodes: CoffeeCardData[] } },
  { filter?: CoffeeFilter; sort?: CoffeeSort; limit?: number; offset?: number }
>(/* GraphQL */ `
  query Coffees($filter: CoffeeFilter, $sort: CoffeeSort, $limit: Int, $offset: Int) {
    coffees(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      total
      nodes {
        id slug name roastLevel flavorNotes imageUrls commentCount
        shop { slug name city }
        originCountry { nameEn nameZh }
        processingMethod { nameEn nameZh }
        variety { name }
        variants { priceTwd isAvailable }
      }
    }
  }
`);

/** Lowest available variant price in whole NT$, or null if sold out. */
export function fromPrice(c: Pick<CoffeeCardData, "variants">): number | null {
  const prices = c.variants.filter((v) => v.isAvailable).map((v) => v.priceTwd);
  return prices.length ? Math.min(...prices) : null;
}

// ---------------------------------------------------------------------------
// Coffee detail
// ---------------------------------------------------------------------------

export type GrindOption = "WHOLE_BEAN" | "COARSE" | "MEDIUM" | "FINE" | "ESPRESSO";

export interface Variant {
  id: string;
  grind: GrindOption;
  weightG: number;
  priceTwd: number;
  stock: number;
  isAvailable: boolean;
}

export interface CommentData {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; displayName: string };
}

export interface CoffeeDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  roastLevel: RoastLevel;
  flavorNotes: string[];
  imageUrls: string[];
  isPublished: boolean;
  commentCount: number;
  shop: { id: string; slug: string; name: string; city: string; description: string; logoUrl: string | null };
  originCountry: { nameEn: string; nameZh: string; region: string };
  processingMethod: { nameEn: string; nameZh: string };
  variety: { name: string } | null;
  variants: Variant[];
  comments: CommentData[];
}

export const COFFEE = typed<{ coffee: CoffeeDetail | null }, { id: string }>(/* GraphQL */ `
  query Coffee($id: ID!) {
    coffee(id: $id) {
      id slug name description roastLevel flavorNotes imageUrls isPublished commentCount
      shop { id slug name city description logoUrl }
      originCountry { nameEn nameZh region }
      processingMethod { nameEn nameZh }
      variety { name }
      variants { id grind weightG priceTwd stock isAvailable }
      comments(limit: ${COMMENTS_PAGE}) { id body createdAt user { id displayName } }
    }
  }
`);

/** A later page of a coffee's comments ("load more" on the coffee page). */
export const COFFEE_COMMENTS = typed<
  { coffee: { comments: CommentData[] } | null },
  { id: string; limit: number; offset: number }
>(/* GraphQL */ `
  query CoffeeComments($id: ID!, $limit: Int!, $offset: Int!) {
    coffee(id: $id) {
      comments(limit: $limit, offset: $offset) { id body createdAt user { id displayName } }
    }
  }
`);

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

export interface ShopSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  city: string;
}

export const SHOPS = typed<
  { shops: { total: number; nodes: ShopSummary[] } },
  { city?: string; limit?: number; offset?: number }
>(/* GraphQL */ `
  query Shops($city: String, $limit: Int, $offset: Int) {
    shops(city: $city, limit: $limit, offset: $offset) {
      total
      nodes { id slug name description logoUrl bannerUrl city }
    }
  }
`);

export const SHOP = typed<
  { shop: (ShopSummary & { coffees: { total: number; nodes: CoffeeCardData[] } }) | null },
  { slug: string; limit?: number; offset?: number }
>(/* GraphQL */ `
  query Shop($slug: String!, $limit: Int, $offset: Int) {
    shop(slug: $slug) {
      id slug name description logoUrl bannerUrl city
      coffees(limit: $limit, offset: $offset) {
        total
        nodes {
          id slug name roastLevel flavorNotes imageUrls commentCount
          shop { slug name city }
          originCountry { nameEn nameZh }
          processingMethod { nameEn nameZh }
          variety { name }
          variants { priceTwd isAvailable }
        }
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// Map + home page
// ---------------------------------------------------------------------------

export interface ShopPin {
  id: string;
  slug: string;
  name: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

export const SHOPS_FOR_MAP = typed<{ shopsForMap: ShopPin[] }>(/* GraphQL */ `
  query ShopsForMap {
    shopsForMap { id slug name city lat lng }
  }
`);

export const HOME = typed<
  { popularCoffees: CoffeeCardData[]; shops: { nodes: ShopSummary[] } },
  { popular: number; shops: number }
>(/* GraphQL */ `
  query Home($popular: Int, $shops: Int) {
    popularCoffees(limit: $popular) {
      id slug name roastLevel flavorNotes imageUrls commentCount
      shop { slug name city }
      originCountry { nameEn nameZh }
      processingMethod { nameEn nameZh }
      variety { name }
      variants { priceTwd isAvailable }
    }
    shops(limit: $shops) {
      nodes { id slug name description logoUrl bannerUrl city }
    }
  }
`);

/** Group pins by city (zh-TW collation), keeping each city's order stable. */
export function groupByCity(pins: ShopPin[]): [string, ShopPin[]][] {
  const groups = new Map<string, ShopPin[]>();
  for (const p of pins) {
    const city = p.city || "—";
    const list = groups.get(city);
    if (list) list.push(p);
    else groups.set(city, [p]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-TW"));
}

/** True when the pin has a plottable coordinate pair. */
export function hasCoords(p: ShopPin): p is ShopPin & { lat: number; lng: number } {
  return typeof p.lat === "number" && typeof p.lng === "number";
}

/** True when `id` looks like a UUID (avoids a backend round-trip on junk URLs). */
export function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ---------------------------------------------------------------------------
// Comment mutations (signed-in users)
// ---------------------------------------------------------------------------

/** Backend limit for comment bodies (rune count). */
export const COMMENT_MAX = 500;

export const ADD_COMMENT = typed<{ addComment: { id: string } }, { input: { coffeeId: string; body: string } }>(
  /* GraphQL */ `
    mutation AddComment($input: AddCommentInput!) {
      addComment(input: $input) { id }
    }
  `,
);

export const DELETE_COMMENT = typed<{ deleteComment: boolean }, { id: string }>(/* GraphQL */ `
  mutation DeleteComment($id: ID!) { deleteComment(id: $id) }
`);

// ---------------------------------------------------------------------------
// Sitemap (public data only: the API never returns drafts to anonymous callers)
// ---------------------------------------------------------------------------

export const SITEMAP_SHOPS = typed<{ shops: { total: number; nodes: { slug: string }[] } }, { limit: number; offset: number }>(
  /* GraphQL */ `
    query SitemapShops($limit: Int, $offset: Int) {
      shops(limit: $limit, offset: $offset) { total nodes { slug } }
    }
  `,
);

export const SITEMAP_COFFEES = typed<{ coffees: { total: number; nodes: { id: string }[] } }, { limit: number; offset: number }>(
  /* GraphQL */ `
    query SitemapCoffees($limit: Int, $offset: Int) {
      coffees(limit: $limit, offset: $offset) { total nodes { id } }
    }
  `,
);
