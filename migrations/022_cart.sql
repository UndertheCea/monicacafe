-- Stage 2: the buyer's cart (#21). Lives in Postgres (owner, #9 (a)): durable
-- across logout and devices, one source of truth with orders later.
--
-- One line per (buyer, option). price_twd is the option's price when the line
-- was added or last changed, so the cart can say "price changed" instead of
-- silently charging a different amount. Lines go with the account and with a
-- deleted option (a cart is not history; order lines will RESTRICT instead).

CREATE TABLE cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id  UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  price_twd   INTEGER NOT NULL CHECK (price_twd >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_user_variant_key UNIQUE (user_id, variant_id)
);

CREATE INDEX idx_cart_items_variant_id ON cart_items (variant_id);
