// GraphQL documents for the seller dashboard (all require a signed-in user).
import type { GrindOption, RoastLevel } from "../api";
import { typed } from "../graphql";

export interface DashboardVariant {
  id: string;
  grind: GrindOption;
  weightG: number;
  priceTwd: number;
  stock: number;
  isAvailable: boolean;
}

export interface DashboardCoffee {
  id: string;
  name: string;
  isPublished: boolean;
  commentCount: number;
  createdAt: string;
  variants: DashboardVariant[];
}

export interface DashboardShop {
  id: string;
  slug: string;
  name: string;
  city: string;
  description: string;
  coffees: { total: number; nodes: DashboardCoffee[] };
}

const VARIANT_FIELDS = `id grind weightG priceTwd stock isAvailable`;

/** The signed-in seller's shop with every coffee, drafts included (owner-only). */
export const MY_SHOP = typed<{ me: { id: string; shop: DashboardShop | null } | null }>(/* GraphQL */ `
  query MyShop {
    me {
      id
      shop {
        id slug name city description
        coffees(limit: 100) {
          total
          nodes { id name isPublished commentCount createdAt variants { ${VARIANT_FIELDS} } }
        }
      }
    }
  }
`);

export const CREATE_SHOP = typed<
  { createShop: { id: string; slug: string } },
  { input: { slug: string; name: string; description: string; city: string } }
>(/* GraphQL */ `
  mutation CreateShop($input: CreateShopInput!) {
    createShop(input: $input) { id slug }
  }
`);

export const PUBLISH_COFFEE = typed<{ publishCoffee: { id: string; isPublished: boolean } }, { id: string }>(
  /* GraphQL */ `
    mutation PublishCoffee($id: ID!) { publishCoffee(id: $id) { id isPublished } }
  `,
);

export const UNPUBLISH_COFFEE = typed<{ unpublishCoffee: { id: string; isPublished: boolean } }, { id: string }>(
  /* GraphQL */ `
    mutation UnpublishCoffee($id: ID!) { unpublishCoffee(id: $id) { id isPublished } }
  `,
);

// ── Coffee editor ────────────────────────────────────────────────────────────

export interface VariantInput {
  grind: GrindOption;
  weightG: number;
  priceTwd: number;
  stock: number;
}

export const CREATE_COFFEE = typed<
  { createCoffee: { id: string } },
  {
    input: {
      name: string;
      description: string;
      originCountryId: string;
      varietyId: string | null;
      processingMethodId: string;
      roastLevel: RoastLevel;
      flavorNotes: string[];
      variants: VariantInput[];
    };
  }
>(/* GraphQL */ `
  mutation CreateCoffee($input: CreateCoffeeInput!) {
    createCoffee(input: $input) { id }
  }
`);

export interface EditableCoffee {
  id: string;
  name: string;
  description: string;
  originCountry: { id: string };
  processingMethod: { id: string };
  variety: { id: string } | null;
  roastLevel: RoastLevel;
  flavorNotes: string[];
  imageUrls: string[];
  isPublished: boolean;
  shop: { id: string };
  variants: DashboardVariant[];
}

const EDITABLE_COFFEE_FIELDS = `id name description originCountry { id } processingMethod { id } variety { id }
  roastLevel flavorNotes imageUrls isPublished shop { id }`;

export const EDIT_COFFEE = typed<{ coffee: EditableCoffee | null }, { id: string }>(/* GraphQL */ `
  query EditCoffee($id: ID!) {
    coffee(id: $id) { ${EDITABLE_COFFEE_FIELDS} variants { ${VARIANT_FIELDS} } }
  }
`);

export interface UpdateCoffeeInput {
  name?: string;
  description?: string;
  originCountryId?: string;
  processingMethodId?: string;
  varietyId?: string;
  clearVariety?: boolean;
  roastLevel?: string;
  flavorNotes?: string[];
}

export const UPDATE_COFFEE = typed<
  { updateCoffee: Omit<EditableCoffee, "variants"> },
  { id: string; input: UpdateCoffeeInput }
>(/* GraphQL */ `
  mutation UpdateCoffee($id: ID!, $input: UpdateCoffeeInput!) {
    updateCoffee(id: $id, input: $input) { ${EDITABLE_COFFEE_FIELDS} }
  }
`);

export const ADD_VARIANT = typed<{ addVariant: DashboardVariant }, { coffeeId: string; input: VariantInput }>(
  /* GraphQL */ `
    mutation AddVariant($coffeeId: ID!, $input: VariantInput!) {
      addVariant(coffeeId: $coffeeId, input: $input) { ${VARIANT_FIELDS} }
    }
  `,
);

export const UPDATE_VARIANT = typed<
  { updateVariant: DashboardVariant },
  { id: string; input: { priceTwd?: number; stock?: number; isAvailable?: boolean } }
>(/* GraphQL */ `
  mutation UpdateVariant($id: ID!, $input: UpdateVariantInput!) {
    updateVariant(id: $id, input: $input) { ${VARIANT_FIELDS} }
  }
`);

export const DELETE_VARIANT = typed<{ deleteVariant: boolean }, { id: string }>(/* GraphQL */ `
  mutation DeleteVariant($id: ID!) { deleteVariant(id: $id) }
`);

// ── Shop profile ─────────────────────────────────────────────────────────────

export interface EditableShop {
  id: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  lat: number | null;
  lng: number | null;
  logoUrl: string | null;
  bannerUrl: string | null;
}

const EDITABLE_SHOP_FIELDS = `id slug name description city lat lng logoUrl bannerUrl`;

export const MY_SHOP_PROFILE = typed<{ me: { id: string; shop: EditableShop | null } | null }>(/* GraphQL */ `
  query MyShopProfile { me { id shop { ${EDITABLE_SHOP_FIELDS} } } }
`);

export interface UpdateShopInput {
  name?: string;
  description?: string;
  city?: string;
  lat?: number;
  lng?: number;
  logoUrl?: string;
  bannerUrl?: string;
}

export const UPDATE_SHOP = typed<{ updateShop: EditableShop }, { id: string; input: UpdateShopInput }>(/* GraphQL */ `
  mutation UpdateShop($id: ID!, $input: UpdateShopInput!) {
    updateShop(id: $id, input: $input) { ${EDITABLE_SHOP_FIELDS} }
  }
`);
