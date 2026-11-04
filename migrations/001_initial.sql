-- Moni Cafe — initial schema
-- Taiwan coffee marketplace: shops, coffees (TWD pricing), curated dropdowns, comments
-- Stage 2 additions (cart, orders, ECPay) will come in a separate migration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('BUYER', 'SELLER', 'ADMIN');

CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT      NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'BUYER',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);

-- ─── Shops ────────────────────────────────────────────────────────────────────
-- Each seller (roastery, coffee shop, small roaster) has one shop page.

CREATE TABLE shops (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES users(id),
  slug        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  logo_url    TEXT,
  banner_url  TEXT,
  city        TEXT        NOT NULL DEFAULT '',
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shops_owner_id ON shops (owner_id);
CREATE INDEX idx_shops_city     ON shops (city);

-- ─── Reference / curated dropdowns ───────────────────────────────────────────

CREATE TABLE origin_countries (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en  TEXT NOT NULL UNIQUE,
  name_zh  TEXT NOT NULL,
  region   TEXT NOT NULL  -- Africa / Americas / Asia-Pacific / Middle East
);

CREATE TABLE coffee_varieties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE processing_methods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en     TEXT NOT NULL UNIQUE,
  name_zh     TEXT NOT NULL,
  description TEXT
);

-- ─── Coffees ──────────────────────────────────────────────────────────────────
CREATE TYPE roast_level AS ENUM ('LIGHT', 'MEDIUM', 'MEDIUM_DARK', 'DARK');

CREATE TABLE coffees (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id              UUID        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  slug                 TEXT        NOT NULL UNIQUE,
  description          TEXT        NOT NULL DEFAULT '',
  origin_country_id    UUID        NOT NULL REFERENCES origin_countries(id),
  variety_id           UUID        REFERENCES coffee_varieties(id),
  processing_method_id UUID        NOT NULL REFERENCES processing_methods(id),
  roast_level          roast_level NOT NULL,
  flavor_notes         TEXT[]      NOT NULL DEFAULT '{}',
  image_urls           TEXT[]      NOT NULL DEFAULT '{}',
  is_published         BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coffees_shop_id              ON coffees (shop_id);
CREATE INDEX idx_coffees_origin_country_id    ON coffees (origin_country_id);
CREATE INDEX idx_coffees_variety_id           ON coffees (variety_id);
CREATE INDEX idx_coffees_processing_method_id ON coffees (processing_method_id);
CREATE INDEX idx_coffees_roast_level          ON coffees (roast_level);
CREATE INDEX idx_coffees_is_published         ON coffees (is_published);

-- ─── Variants ─────────────────────────────────────────────────────────────────
CREATE TYPE grind_option AS ENUM ('WHOLE_BEAN', 'COARSE', 'MEDIUM', 'FINE', 'ESPRESSO');

CREATE TABLE variants (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  coffee_id    UUID         NOT NULL REFERENCES coffees(id) ON DELETE CASCADE,
  grind        grind_option NOT NULL,
  weight_g     INTEGER      NOT NULL CHECK (weight_g > 0),
  price_twd    INTEGER      NOT NULL CHECK (price_twd >= 0),  -- whole NT$
  stock        INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_available BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_coffee_id ON variants (coffee_id);

-- ─── Comments ─────────────────────────────────────────────────────────────────
-- Simple non-threaded comments on coffees (like Instagram comments).

CREATE TABLE comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id),
  coffee_id  UUID        NOT NULL REFERENCES coffees(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_coffee_id ON comments (coffee_id);
CREATE INDEX idx_comments_user_id   ON comments (user_id);

-- ─── Reference seed data ──────────────────────────────────────────────────────

INSERT INTO origin_countries (name_en, name_zh, region) VALUES
  ('Ethiopia',           '衣索比亞',   'Africa'),
  ('Kenya',              '肯亞',       'Africa'),
  ('Rwanda',             '盧安達',     'Africa'),
  ('Burundi',            '蒲隆地',     'Africa'),
  ('Tanzania',           '坦尚尼亞',   'Africa'),
  ('Colombia',           '哥倫比亞',   'Americas'),
  ('Brazil',             '巴西',       'Americas'),
  ('Guatemala',          '瓜地馬拉',   'Americas'),
  ('Honduras',           '宏都拉斯',   'Americas'),
  ('Costa Rica',         '哥斯大黎加', 'Americas'),
  ('Panama',             '巴拿馬',     'Americas'),
  ('Peru',               '秘魯',       'Americas'),
  ('Bolivia',            '玻利維亞',   'Americas'),
  ('El Salvador',        '薩爾瓦多',   'Americas'),
  ('Nicaragua',          '尼加拉瓜',   'Americas'),
  ('Yemen',              '葉門',       'Middle East'),
  ('Indonesia',          '印尼',       'Asia-Pacific'),
  ('Papua New Guinea',   '巴布亞紐幾內亞', 'Asia-Pacific'),
  ('Taiwan',             '台灣',       'Asia-Pacific'),
  ('Myanmar',            '緬甸',       'Asia-Pacific'),
  ('Laos',               '寮國',       'Asia-Pacific'),
  ('Philippines',        '菲律賓',     'Asia-Pacific'),
  ('India',              '印度',       'Asia-Pacific'),
  ('China (Yunnan)',     '中國（雲南）', 'Asia-Pacific');

INSERT INTO coffee_varieties (name, description) VALUES
  ('Geisha',          'Originally from Ethiopia; celebrated for jasmine and tropical fruit notes.'),
  ('Bourbon',         'Classic mutation of Typica; sweet, full-bodied.'),
  ('Typica',          'One of the oldest cultivated varieties; clean and balanced.'),
  ('Caturra',         'Natural mutation of Bourbon; bright acidity.'),
  ('Catuai',          'Hybrid of Mundo Novo and Caturra; high yield.'),
  ('SL28',            'Kenyan variety; blackcurrant and citrus.'),
  ('SL34',            'Kenyan variety; full body, berry and citrus.'),
  ('Ruiru 11',        'Disease-resistant Kenyan hybrid.'),
  ('Batian',          'Newer Kenyan variety; complex and clean.'),
  ('Heirloom',        'General term for Ethiopian landrace varieties.'),
  ('Landrace',        'Indigenous wild or semi-wild varieties.'),
  ('Pink Bourbon',    'Rare pink-fruited Bourbon mutation from Colombia.'),
  ('Red Bourbon',     'Red-fruited Bourbon mutation.'),
  ('Yellow Bourbon',  'Yellow-fruited Bourbon mutation.'),
  ('Pacamara',        'Cross of Pacas and Maragogipe; large bean, complex.'),
  ('Maragogipe',      'Elephant bean; mild and sweet.'),
  ('Mundo Novo',      'Typica × Bourbon hybrid; reliable and clean.'),
  ('Catimor',         'Timor hybrid × Caturra; disease resistant.'),
  ('Villalobos',      'Costa Rican Typica selection.'),
  ('Mokka',           'Very small bean; chocolate and spice.'),
  ('Kent',            'Indian selection from Typica.'),
  ('Lempira',         'Honduran Catimor selection.'),
  ('IHCAFE 90',       'Honduran disease-resistant variety.');

INSERT INTO processing_methods (name_en, name_zh, description) VALUES
  ('Washed',          '水洗',     'Fruit removed before drying; clean, bright, terroir-focused.'),
  ('Natural',         '日曬',     'Dried whole with fruit intact; fruity, winey, full-bodied.'),
  ('Honey',           '蜜處理',   'Partial mucilage left during drying; balanced sweetness.'),
  ('Yellow Honey',    '黃蜜',     'Minimal mucilage; closest to washed.'),
  ('Red Honey',       '紅蜜',     'More mucilage left; sweeter, more complex.'),
  ('Black Honey',     '黑蜜',     'Maximum mucilage; richest, most fruit-forward honey.'),
  ('Anaerobic',       '厭氧',     'Fermented in sealed oxygen-free tanks; intense and complex.'),
  ('Anaerobic Natural','厭氧日曬', 'Anaerobic fermentation then natural drying.'),
  ('Anaerobic Washed','厭氧水洗', 'Anaerobic fermentation then washed.'),
  ('Wet-Hulled',      '濕刨法',   'Sumatran method; earthy, full-bodied, low acidity.'),
  ('Carbonic Maceration','碳酸浸漬', 'CO₂-rich fermentation; vibrant fruit, low tannin.'),
  ('Double Fermentation','雙重發酵', 'Two-stage fermentation for added complexity.');
