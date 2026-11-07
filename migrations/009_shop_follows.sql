-- Moni Cafe — followed shops (issue #102)
-- A signed-in user following a roaster. One row per (user, shop); both sides
-- cascade, so deleting an account or a shop takes its follows with it.

CREATE TABLE shop_follows (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id    UUID        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, shop_id)
);

-- (user_id, shop_id) is covered by the UNIQUE index; counts go by shop.
CREATE INDEX idx_shop_follows_shop_id ON shop_follows (shop_id);
