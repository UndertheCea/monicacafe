// GraphQL documents for the cart (#280; API from #21). All need a signed-in buyer.
import { typed } from "./graphql";
import type { CartData } from "./cart";

const CART_FIELDS = `
  items {
    id quantity priceTwd addedPriceTwd priceChanged available lineTotalTwd
    variant { id grind weightG stock isAvailable }
    coffee { id name shop { slug name } }
  }
  subtotalTwd itemCount
`;

export const CART = typed<{ cart: CartData }, Record<string, never>>(/* GraphQL */ `
  query Cart { cart { ${CART_FIELDS} } }
`);

export const ADD_TO_CART = typed<{ addToCart: CartData }, { variantId: string; quantity: number }>(/* GraphQL */ `
  mutation AddToCart($variantId: ID!, $quantity: Int!) { addToCart(variantId: $variantId, quantity: $quantity) { ${CART_FIELDS} } }
`);

export const UPDATE_CART_ITEM = typed<{ updateCartItem: CartData }, { id: string; quantity: number }>(/* GraphQL */ `
  mutation UpdateCartItem($id: ID!, $quantity: Int!) { updateCartItem(id: $id, quantity: $quantity) { ${CART_FIELDS} } }
`);

export const REMOVE_FROM_CART = typed<{ removeFromCart: CartData }, { id: string }>(/* GraphQL */ `
  mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) { ${CART_FIELDS} } }
`);

/**
 * Sets the line's price snapshot to today's price, so "price changed" goes away
 * (#311) — only while today's price is still the one shown (#371).
 */
export const ACCEPT_CART_PRICE = typed<{ acceptCartPrice: CartData }, { id: string; expectedPriceTwd: number }>(/* GraphQL */ `
  mutation AcceptCartPrice($id: ID!, $expectedPriceTwd: TWD!) {
    acceptCartPrice(id: $id, expectedPriceTwd: $expectedPriceTwd) { ${CART_FIELDS} }
  }
`);
