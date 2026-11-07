// Typed queries against backend/graph/schema.graphqls. Keep these types in
// sync with the schema (a codegen step can replace them later).
import { typed } from "./graphql";
import { COMMENTS_PAGE, COMMENT_MAX_CHARS } from "./comments";
import type { CoffeeSort, RoastLevel } from "./coffeeQuery";
import type { ShopSort } from "./shopQuery";
import type { SitemapCoffee, SitemapShop } from "./sitemap";

export { ROAST_LEVELS, type RoastLevel } from "./coffeeQuery";

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
  /** Keywords; every word must match (see CoffeeFilter.search in the schema). */
  search?: string;
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

/** Fields every CoffeeCard needs (keep in sync with CoffeeCardData). */
const CARD_FIELDS = `
  id slug name roastLevel flavorNotes imageUrls commentCount
  shop { slug name city }
  originCountry { nameEn nameZh }
  processingMethod { nameEn nameZh }
  variety { name }
  variants { priceTwd isAvailable }
`;

export const COFFEES = typed<
  { coffees: { total: number; nodes: CoffeeCardData[] } },
  { filter?: CoffeeFilter; sort?: CoffeeSort; limit?: number; offset?: number }
>(/* GraphQL */ `
  query Coffees($filter: CoffeeFilter, $sort: CoffeeSort, $limit: Int, $offset: Int) {
    coffees(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
      total
      nodes { ${CARD_FIELDS} }
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
  /** Set once the author has edited the text. */
  editedAt: string | null;
  /** The author owns the coffee's shop (the roaster answering). */
  fromShop: boolean;
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
  saveCount: number;
  shop: { id: string; slug: string; name: string; city: string; description: string; logoUrl: string | null };
  originCountry: { nameEn: string; nameZh: string; region: string };
  processingMethod: { nameEn: string; nameZh: string };
  variety: { name: string } | null;
  variants: Variant[];
  comments: CommentData[];
}

const COFFEE_DETAIL_FIELDS = `
  id slug name description roastLevel flavorNotes imageUrls isPublished commentCount saveCount
  shop { id slug name city description logoUrl }
  originCountry { nameEn nameZh region }
  processingMethod { nameEn nameZh }
  variety { name }
  variants { id grind weightG priceTwd stock isAvailable }
  comments(limit: ${COMMENTS_PAGE}) { id body createdAt editedAt fromShop user { id displayName } }
`;

export const COFFEE = typed<{ coffee: CoffeeDetail | null }, { id: string }>(/* GraphQL */ `
  query Coffee($id: ID!) {
    coffee(id: $id) { ${COFFEE_DETAIL_FIELDS} }
  }
`);

/**
 * The public coffee page: the coffee plus a few more from its shop (one more
 * than shown, since the list can include this coffee) and similar coffees from
 * other shops. Anonymous server
 * fetches only ever see published coffees there.
 */
export const COFFEE_PAGE = typed<
  {
    coffee:
      | (CoffeeDetail & {
          more: { coffees: { total: number; nodes: CoffeeCardData[] } };
          similar: CoffeeCardData[];
        })
      | null;
  },
  { id: string; more: number; similar: number }
>(/* GraphQL */ `
  query CoffeePage($id: ID!, $more: Int!, $similar: Int!) {
    coffee(id: $id) {
      ${COFFEE_DETAIL_FIELDS}
      more: shop { coffees(limit: $more) { total nodes { ${CARD_FIELDS} } } }
      similar(limit: $similar) { ${CARD_FIELDS} }
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
      comments(limit: $limit, offset: $offset) { id body createdAt editedAt fromShop user { id displayName } }
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
  /** Published coffees only. */
  coffeeCount: number;
  followerCount: number;
}

/** A shop page also needs the location (structured data). */
export type ShopDetail = ShopSummary & { lat: number | null; lng: number | null };

const SHOP_FIELDS = "id slug name description logoUrl bannerUrl city coffeeCount followerCount";

export const SHOPS = typed<
  { shops: { total: number; nodes: ShopSummary[] } },
  { city?: string; search?: string; sort?: ShopSort; limit?: number; offset?: number }
>(/* GraphQL */ `
  query Shops($city: String, $search: String, $sort: ShopSort, $limit: Int, $offset: Int) {
    shops(city: $city, search: $search, sort: $sort, limit: $limit, offset: $offset) {
      total
      nodes { ${SHOP_FIELDS} }
    }
  }
`);

export const SHOP = typed<
  { shop: (ShopDetail & { coffees: { total: number; nodes: CoffeeCardData[] } }) | null },
  { slug: string; filter?: CoffeeFilter; sort?: CoffeeSort; limit?: number; offset?: number }
>(/* GraphQL */ `
  query Shop($slug: String!, $filter: CoffeeFilter, $sort: CoffeeSort, $limit: Int, $offset: Int) {
    shop(slug: $slug) {
      ${SHOP_FIELDS} lat lng
      coffees(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
        total
        nodes { ${CARD_FIELDS} }
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
    popularCoffees(limit: $popular) { ${CARD_FIELDS} }
    shops(limit: $shops) {
      nodes { ${SHOP_FIELDS} }
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
export const COMMENT_MAX = COMMENT_MAX_CHARS;

export const ADD_COMMENT = typed<{ addComment: { id: string } }, { input: { coffeeId: string; body: string } }>(
  /* GraphQL */ `
    mutation AddComment($input: AddCommentInput!) {
      addComment(input: $input) { id }
    }
  `,
);

export const UPDATE_COMMENT = typed<
  { updateComment: { id: string; body: string; editedAt: string | null } },
  { id: string; body: string }
>(/* GraphQL */ `
  mutation UpdateComment($id: ID!, $body: String!) { updateComment(id: $id, body: $body) { id body editedAt } }
`);

export const DELETE_COMMENT = typed<{ deleteComment: boolean }, { id: string }>(/* GraphQL */ `
  mutation DeleteComment($id: ID!) { deleteComment(id: $id) }
`);

// ---------------------------------------------------------------------------
// Saved coffees (signed-in users)
// ---------------------------------------------------------------------------

export interface SaveResult {
  id: string;
  isSaved: boolean;
  saveCount: number;
}

/** The viewer's saved state for one coffee (the public page is rendered anonymously). */
export const COFFEE_SAVED = typed<{ coffee: SaveResult | null }, { id: string }>(/* GraphQL */ `
  query CoffeeSaved($id: ID!) { coffee(id: $id) { id isSaved saveCount } }
`);

export const SAVE_COFFEE = typed<{ saveCoffee: SaveResult }, { id: string }>(/* GraphQL */ `
  mutation SaveCoffee($id: ID!) { saveCoffee(id: $id) { id isSaved saveCount } }
`);

export const UNSAVE_COFFEE = typed<{ unsaveCoffee: SaveResult | null }, { id: string }>(/* GraphQL */ `
  mutation UnsaveCoffee($id: ID!) { unsaveCoffee(id: $id) { id isSaved saveCount } }
`);

/** A page of the viewer's saved coffees (/account). */
export const MY_SAVED_COFFEES = typed<
  { me: { savedCoffees: { total: number; nodes: CoffeeCardData[] } } | null },
  { limit: number; offset: number }
>(/* GraphQL */ `
  query MySavedCoffees($limit: Int, $offset: Int) {
    me { savedCoffees(limit: $limit, offset: $offset) { total nodes { ${CARD_FIELDS} } } }
  }
`);

// ---------------------------------------------------------------------------
// Followed shops (signed-in users)
// ---------------------------------------------------------------------------

export interface FollowResult {
  id: string;
  isFollowed: boolean;
  followerCount: number;
}

/** The viewer's follow state for one shop (the public page is rendered anonymously). */
export const SHOP_FOLLOWED = typed<{ shop: FollowResult | null }, { slug: string }>(/* GraphQL */ `
  query ShopFollowed($slug: String!) { shop(slug: $slug) { id isFollowed followerCount } }
`);

export const FOLLOW_SHOP = typed<{ followShop: FollowResult }, { id: string }>(/* GraphQL */ `
  mutation FollowShop($id: ID!) { followShop(id: $id) { id isFollowed followerCount } }
`);

export const UNFOLLOW_SHOP = typed<{ unfollowShop: FollowResult | null }, { id: string }>(/* GraphQL */ `
  mutation UnfollowShop($id: ID!) { unfollowShop(id: $id) { id isFollowed followerCount } }
`);

// ---------------------------------------------------------------------------
// Sitemap (public data only: the API never returns drafts to anonymous callers)
// ---------------------------------------------------------------------------

export const SITEMAP_SHOPS = typed<{ shops: { total: number; nodes: SitemapShop[] } }, { limit: number; offset: number }>(
  /* GraphQL */ `
    query SitemapShops($limit: Int, $offset: Int) {
      shops(limit: $limit, offset: $offset) { total nodes { slug updatedAt } }
    }
  `,
);

export const SITEMAP_COFFEES = typed<{ coffees: { total: number; nodes: SitemapCoffee[] } }, { limit: number; offset: number }>(
  /* GraphQL */ `
    query SitemapCoffees($limit: Int, $offset: Int) {
      coffees(limit: $limit, offset: $offset) { total nodes { id updatedAt shop { slug } } }
    }
  `,
);
