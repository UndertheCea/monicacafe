// GraphQL documents for the seller dashboard (all require a signed-in user).
import type { GrindOption, RoastLevel } from "../api";
import { typed } from "../graphql";
import { DASH_COFFEES_PAGE } from "./coffeePages";

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

const DASHBOARD_COFFEE_FIELDS = `id name isPublished commentCount createdAt variants { ${VARIANT_FIELDS} }`;

/** The signed-in seller's shop with its first page of coffees, drafts included (owner-only). */
export const MY_SHOP = typed<{ me: { id: string; shop: DashboardShop | null } | null }>(/* GraphQL */ `
  query MyShop {
    me {
      id
      shop {
        id slug name city description
        coffees(limit: ${DASH_COFFEES_PAGE}) { total nodes { ${DASHBOARD_COFFEE_FIELDS} } }
      }
    }
  }
`);

/** A later page of the seller's coffees ("load more" on the dashboard). */
export const MY_SHOP_COFFEES = typed<
  { me: { id: string; shop: { id: string; coffees: DashboardShop["coffees"] } | null } | null },
  { offset: number }
>(/* GraphQL */ `
  query MyShopCoffees($offset: Int!) {
    me {
      id
      shop { id coffees(limit: ${DASH_COFFEES_PAGE}, offset: $offset) { total nodes { ${DASHBOARD_COFFEE_FIELDS} } } }
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
  /** Replaces the gallery (order kept; first is the cover). */
  imageUrls?: string[];
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

// ── Image uploads ────────────────────────────────────────────────────────────

export type ImageKind = "SHOP_LOGO" | "SHOP_BANNER" | "COFFEE_PHOTO";

export interface ImageUpload {
  uploadUrl: string;
  publicUrl: string;
  headers: { name: string; value: string }[];
}

export const CREATE_IMAGE_UPLOAD = typed<
  { createImageUpload: ImageUpload },
  { input: { kind: ImageKind; targetId: string; contentType: string; byteSize: number } }
>(/* GraphQL */ `
  mutation CreateImageUpload($input: ImageUploadInput!) {
    createImageUpload(input: $input) { uploadUrl publicUrl headers { name value } }
  }
`);

/** Drafts only; the API answers CONFLICT for a published coffee. */
export const DELETE_COFFEE = typed<{ deleteCoffee: boolean }, { id: string }>(/* GraphQL */ `
  mutation DeleteCoffee($id: ID!) { deleteCoffee(id: $id) }
`);

/** Copies a coffee into a new draft (no photos, no comments). */
export const DUPLICATE_COFFEE = typed<{ duplicateCoffee: { id: string } }, { id: string; name?: string }>(/* GraphQL */ `
  mutation DuplicateCoffee($id: ID!, $name: String) { duplicateCoffee(id: $id, name: $name) { id } }
`);

/** A comment in a cross-coffee list (dashboard "Recent comments", /account "My comments"). */
export interface ListedComment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; displayName: string };
  /** null when the API hides the coffee from this viewer (someone else's draft). */
  coffee: { id: string; name: string; isPublished: boolean } | null;
}

export type CommentPage = { total: number; nodes: ListedComment[] };

export const LISTED_COMMENT_FIELDS = `id body createdAt user { id displayName } coffee { id name isPublished }`;

/** A page of comments across the signed-in seller's coffees, newest first (owner-only). */
export const MY_SHOP_COMMENTS = typed<
  { me: { id: string; shop: { id: string; recentComments: CommentPage } | null } | null },
  { limit: number; offset: number }
>(/* GraphQL */ `
  query MyShopComments($limit: Int!, $offset: Int!) {
    me { id shop { id recentComments(limit: $limit, offset: $offset) { total nodes { ${LISTED_COMMENT_FIELDS} } } } }
  }
`);

/** A page of the signed-in user's own comments, newest first (/account). */
export const MY_COMMENTS = typed<{ me: { id: string; comments: CommentPage } | null }, { limit: number; offset: number }>(
  /* GraphQL */ `
    query MyComments($limit: Int!, $offset: Int!) {
      me { id comments(limit: $limit, offset: $offset) { total nodes { ${LISTED_COMMENT_FIELDS} } } }
    }
  `,
);
