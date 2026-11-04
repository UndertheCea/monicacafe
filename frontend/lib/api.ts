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
