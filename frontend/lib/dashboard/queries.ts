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
  isPublished: boolean;
  shop: { id: string };
  variants: DashboardVariant[];
}

export const EDIT_COFFEE = typed<{ coffee: EditableCoffee | null }, { id: string }>(/* GraphQL */ `
  query EditCoffee($id: ID!) {
    coffee(id: $id) { id name isPublished shop { id } variants { ${VARIANT_FIELDS} } }
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
