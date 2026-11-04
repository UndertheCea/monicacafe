-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('CUSTOMER', 'ADMIN');

CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT      NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  first_name    TEXT        NOT NULL,
  last_name     TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'CUSTOMER',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);

-- ─── Addresses ────────────────────────────────────────────────────────────────
CREATE TABLE addresses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line1       TEXT        NOT NULL,
  line2       TEXT,
  city        TEXT        NOT NULL,
  state       TEXT        NOT NULL,
  postal_code TEXT        NOT NULL,
  country     TEXT        NOT NULL DEFAULT 'US',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_addresses_user_id ON addresses (user_id);

-- ─── Producers ────────────────────────────────────────────────────────────────
CREATE TABLE producers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  country     TEXT        NOT NULL,
  region      TEXT        NOT NULL,
  altitude    INT,
  description TEXT        NOT NULL,
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Coffees ──────────────────────────────────────────────────────────────────
CREATE TYPE roast_level AS ENUM ('LIGHT', 'MEDIUM', 'MEDIUM_DARK', 'DARK');

CREATE TABLE coffees (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  slug              TEXT        NOT NULL UNIQUE,
  producer_id       UUID        NOT NULL REFERENCES producers(id),
  origin            TEXT        NOT NULL,
  roast_level       roast_level NOT NULL,
  processing_method TEXT        NOT NULL,
  flavor_notes      TEXT[]      NOT NULL DEFAULT '{}',
  description       TEXT        NOT NULL,
  image_url         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coffees_producer_id ON coffees (producer_id);
CREATE INDEX idx_coffees_roast_level ON coffees (roast_level);

-- ─── Variants ─────────────────────────────────────────────────────────────────
CREATE TYPE grind_option AS ENUM ('WHOLE_BEAN', 'COARSE', 'MEDIUM', 'FINE', 'ESPRESSO');

CREATE TABLE variants (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  coffee_id    UUID         NOT NULL REFERENCES coffees(id) ON DELETE CASCADE,
  grind        grind_option NOT NULL,
  weight_grams INT          NOT NULL,
  price_usd    NUMERIC(8,2) NOT NULL CHECK (price_usd > 0),
  stock        INT          NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_coffee_id ON variants (coffee_id);

-- ─── Orders ───────────────────────────────────────────────────────────────────
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED');

CREATE TABLE orders (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID         NOT NULL REFERENCES users(id),
  status                  order_status NOT NULL DEFAULT 'PENDING',
  total_usd               NUMERIC(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  shipping_address_id     UUID         NOT NULL REFERENCES addresses(id),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user_id ON orders (user_id);

CREATE TABLE order_items (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id     UUID         NOT NULL REFERENCES variants(id),
  quantity       INT          NOT NULL CHECK (quantity > 0),
  unit_price_usd NUMERIC(8,2) NOT NULL
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);

-- ─── Reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id),
  coffee_id  UUID        NOT NULL REFERENCES coffees(id) ON DELETE CASCADE,
  rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, coffee_id)
);

CREATE INDEX idx_reviews_coffee_id ON reviews (coffee_id);

-- ─── Subscriptions ────────────────────────────────────────────────────────────
CREATE TYPE subscription_plan   AS ENUM ('MONTHLY_250G', 'MONTHLY_500G', 'MONTHLY_1KG');
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

CREATE TABLE coffee_subscriptions (
  id                      UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID                NOT NULL REFERENCES users(id),
  plan                    subscription_plan   NOT NULL,
  status                  subscription_status NOT NULL DEFAULT 'ACTIVE',
  stripe_subscription_id  TEXT                NOT NULL,
  current_period_end      TIMESTAMPTZ         NOT NULL,
  created_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE INDEX idx_coffee_subscriptions_user_id ON coffee_subscriptions (user_id);

-- ─── Seed data ────────────────────────────────────────────────────────────────
INSERT INTO producers (name, country, region, altitude, description) VALUES
  ('Yirgacheffe Farmers Cooperative', 'Ethiopia', 'Yirgacheffe', 1900, 'High-altitude cooperative producing exceptional washed naturals.'),
  ('La Esperanza Estate', 'Colombia', 'Huila', 1750, 'Family-owned estate in the mountains of Huila, Colombia.'),
  ('El Injerto', 'Guatemala', 'Huehuetenango', 1800, 'Award-winning single-estate producer in Huehuetenango.');

INSERT INTO coffees (name, slug, producer_id, origin, roast_level, processing_method, flavor_notes, description)
SELECT
  'Yirgacheffe Natural', 'yirgacheffe-natural',
  id, 'Ethiopia', 'LIGHT', 'Natural',
  ARRAY['blueberry', 'dark chocolate', 'jasmine'],
  'A stunning natural process from the highlands of Yirgacheffe. Expect vibrant blueberry sweetness and a floral finish.'
FROM producers WHERE name = 'Yirgacheffe Farmers Cooperative';

INSERT INTO coffees (name, slug, producer_id, origin, roast_level, processing_method, flavor_notes, description)
SELECT
  'Huila Pink Bourbon', 'huila-pink-bourbon',
  id, 'Colombia', 'MEDIUM', 'Washed',
  ARRAY['peach', 'brown sugar', 'orange blossom'],
  'A rare pink bourbon varietal from the Huila region. Silky body with a beautiful peach and citrus sweetness.'
FROM producers WHERE name = 'La Esperanza Estate';

INSERT INTO coffees (name, slug, producer_id, origin, roast_level, processing_method, flavor_notes, description)
SELECT
  'El Injerto Pacamara', 'el-injerto-pacamara',
  id, 'Guatemala', 'MEDIUM_DARK', 'Honey',
  ARRAY['milk chocolate', 'dried fruit', 'walnut'],
  'From one of Guatemala''s most celebrated estates. Rich, full-bodied with notes of milk chocolate and dried stone fruit.'
FROM producers WHERE name = 'El Injerto';

-- Variants for each coffee
INSERT INTO variants (coffee_id, grind, weight_grams, price_usd, stock)
SELECT id, 'WHOLE_BEAN', 250, 18.00, 50 FROM coffees WHERE slug = 'yirgacheffe-natural'
UNION ALL
SELECT id, 'WHOLE_BEAN', 500, 32.00, 50 FROM coffees WHERE slug = 'yirgacheffe-natural'
UNION ALL
SELECT id, 'WHOLE_BEAN', 250, 20.00, 40 FROM coffees WHERE slug = 'huila-pink-bourbon'
UNION ALL
SELECT id, 'WHOLE_BEAN', 500, 36.00, 40 FROM coffees WHERE slug = 'huila-pink-bourbon'
UNION ALL
SELECT id, 'WHOLE_BEAN', 250, 22.00, 30 FROM coffees WHERE slug = 'el-injerto-pacamara'
UNION ALL
SELECT id, 'WHOLE_BEAN', 500, 40.00, 30 FROM coffees WHERE slug = 'el-injerto-pacamara';
