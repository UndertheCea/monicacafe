// Typed queries against backend/graph/schema.graphqls. Keep these types in
// sync with the schema (a codegen step can replace them later).
import { typed } from "./graphql";

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
  { filter?: CoffeeFilter; limit?: number; offset?: number }
>(/* GraphQL */ `
  query Coffees($filter: CoffeeFilter, $limit: Int, $offset: Int) {
    coffees(filter: $filter, limit: $limit, offset: $offset) {
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
  user: { displayName: string };
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
  shop: { slug: string; name: string; city: string; description: string; logoUrl: string | null };
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
      shop { slug name city description logoUrl }
      originCountry { nameEn nameZh region }
      processingMethod { nameEn nameZh }
      variety { name }
      variants { id grind weightG priceTwd stock isAvailable }
      comments { id body createdAt user { displayName } }
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

/** True when `id` looks like a UUID (avoids a backend round-trip on junk URLs). */
export function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

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

export const POPULAR_COFFEES = typed<{ popularCoffees: CoffeeCardData[] }, { limit?: number }>(/* GraphQL */ `
  query PopularCoffees($limit: Int) {
    popularCoffees(limit: $limit) {
      id slug name roastLevel flavorNotes imageUrls commentCount
      shop { slug name city }
      originCountry { nameEn nameZh }
      processingMethod { nameEn nameZh }
      variety { name }
      variants { priceTwd isAvailable }
    }
  }
`);
