-- Moni Cafe — reference shops (DEV ONLY, never production; issue #169).
--
-- Reference shops mirror well-known roasters' current coffee lists so we can
-- see which origins, varieties and processes real menus use that our curated
-- dropdown tables (origin_countries, coffee_varieties, processing_methods)
-- are missing. They are NOT sellers: names end in "（參考）", each is owned by
-- a reference@monicacafe.local account that can't log in, and only factual
-- fields are copied (no photos, logos, marketing copy or prices). The owner
-- deletes them before launch with scripts/remove_reference_shops.sql.
--
-- Applied by scripts/initdb.sh after seed_dev.sql when SEED_REFERENCE_SHOPS=true,
-- or by hand:   psql "$DATABASE_URL" -f scripts/seed_reference.sql
-- Gap report:   ./scripts/reference_gaps.sh
--
-- How it works:
--   1. reference_catalogue holds each roaster's coffees as the roaster prints
--      them (origin_raw / variety_raw / process_raw are copied verbatim).
--   2. reference_load() matches the raw text to the reference tables, case- and
--      space-insensitively, on the English or Chinese name, or through
--      reference_aliases (spelling variants such as "SL-28" → "SL28"), and
--      inserts the coffees. An unmatched origin or process skips the coffee
--      (both are NOT NULL); an unmatched variety is inserted without one.
--   3. The reference_gaps view lists every raw value with no match.
-- Re-running is safe: every insert is ON CONFLICT DO NOTHING.

BEGIN;

-- ─── Staging tables ──────────────────────────────────────────────────────────

-- The roasters we mirror. A shop is only created once it has catalogue rows.
CREATE TABLE IF NOT EXISTS reference_shops (
  slug       TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]+$'),
  name       TEXT NOT NULL,
  source_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reference_catalogue (
  shop_slug      TEXT        NOT NULL REFERENCES reference_shops(slug),
  coffee_name    TEXT        NOT NULL,
  origin_raw     TEXT        NOT NULL,
  variety_raw    TEXT,
  process_raw    TEXT        NOT NULL,
  producer       TEXT        NOT NULL DEFAULT '',
  region         TEXT        NOT NULL DEFAULT '',
  altitude_min_m INTEGER,
  altitude_max_m INTEGER,
  harvest_year   INTEGER,
  roast_level    roast_level NOT NULL DEFAULT 'LIGHT',
  brew_method    TEXT CHECK (brew_method IS NULL OR brew_method IN ('FILTER', 'ESPRESSO', 'OMNI')),
  flavor_notes   TEXT[]      NOT NULL DEFAULT '{}',
  source_url     TEXT        NOT NULL,
  checked_on     DATE        NOT NULL,
  PRIMARY KEY (shop_slug, coffee_name)
);

-- Spelling variants of values we already have. A genuinely new value belongs
-- in a migration (#174), not here.
CREATE TABLE IF NOT EXISTS reference_aliases (
  kind      TEXT NOT NULL CHECK (kind IN ('origin', 'variety', 'process')),
  alias     TEXT NOT NULL,
  canonical TEXT NOT NULL, -- origin_countries.name_en / coffee_varieties.name / processing_methods.name_en
  PRIMARY KEY (kind, alias)
);

-- ─── Matching ────────────────────────────────────────────────────────────────

-- Lowercase, trimmed, inner whitespace collapsed: "  Pink   bourbon " = "pink bourbon".
CREATE OR REPLACE FUNCTION reference_norm(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(btrim(t), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION reference_origin_id(raw TEXT) RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT o.id FROM origin_countries o
  WHERE reference_norm(raw) IN (reference_norm(o.name_en), reference_norm(o.name_zh))
     OR reference_norm(o.name_en) IN (SELECT reference_norm(a.canonical) FROM reference_aliases a
                                      WHERE a.kind = 'origin' AND reference_norm(a.alias) = reference_norm(raw))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION reference_variety_id(raw TEXT) RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT v.id FROM coffee_varieties v
  WHERE reference_norm(raw) = reference_norm(v.name)
     OR reference_norm(v.name) IN (SELECT reference_norm(a.canonical) FROM reference_aliases a
                                   WHERE a.kind = 'variety' AND reference_norm(a.alias) = reference_norm(raw))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION reference_process_id(raw TEXT) RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT p.id FROM processing_methods p
  WHERE reference_norm(raw) IN (reference_norm(p.name_en), reference_norm(p.name_zh))
     OR reference_norm(p.name_en) IN (SELECT reference_norm(a.canonical) FROM reference_aliases a
                                      WHERE a.kind = 'process' AND reference_norm(a.alias) = reference_norm(raw))
  LIMIT 1
$$;

-- Every raw value that doesn't match, with the shops and coffees using it.
-- "skipped" = the coffee wasn't inserted (origin / process); a variety gap
-- only leaves the coffee without a variety.
CREATE OR REPLACE VIEW reference_gaps AS
WITH raw AS (
  SELECT 'origin' AS kind, origin_raw AS value, shop_slug, coffee_name,
         reference_origin_id(origin_raw) IS NULL AS missing, true AS skips
  FROM reference_catalogue
  UNION ALL
  SELECT 'variety', variety_raw, shop_slug, coffee_name,
         reference_variety_id(variety_raw) IS NULL, false
  FROM reference_catalogue WHERE NULLIF(btrim(variety_raw), '') IS NOT NULL
  UNION ALL
  SELECT 'process', process_raw, shop_slug, coffee_name,
         reference_process_id(process_raw) IS NULL, true
  FROM reference_catalogue
)
SELECT kind,
       min(btrim(value)) AS value,
       string_agg(DISTINCT shop_slug, ', ' ORDER BY shop_slug) AS shops,
       string_agg(shop_slug || ': ' || coffee_name, '; ' ORDER BY shop_slug, coffee_name) AS coffees,
       bool_or(skips) AS skipped
FROM raw
WHERE missing
GROUP BY kind, reference_norm(value)
ORDER BY kind, min(btrim(value));

-- ─── Loading ─────────────────────────────────────────────────────────────────

-- Creates the reference users and shops (only for roasters with catalogue rows)
-- and inserts their coffees as published listings without options (no prices
-- are copied, so they read as sold out). Returns how many coffees were inserted.
-- shops.owner_id is UNIQUE, so each shop has its own reference user:
-- reference+<slug>@monicacafe.local, with a disabled password hash.
CREATE OR REPLACE FUNCTION reference_load() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  inserted INTEGER;
BEGIN
  INSERT INTO users (email, password_hash, display_name, role)
  SELECT 'reference+' || s.slug || '@monicacafe.local', '!disabled', '參考目錄 Reference catalogue', 'SELLER'
  FROM reference_shops s
  WHERE EXISTS (SELECT 1 FROM reference_catalogue c WHERE c.shop_slug = s.slug)
  ON CONFLICT (email) DO NOTHING;

  INSERT INTO shops (owner_id, slug, name, description, city)
  SELECT u.id, 'ref-' || s.slug, s.name || '（參考）',
         'Reference catalogue for tracking coffee types; not a seller on Moni Cafe. 參考目錄，用來追蹤咖啡種類；並非 Moni Cafe 的賣家。',
         ''
  FROM reference_shops s
  JOIN users u ON u.email = 'reference+' || s.slug || '@monicacafe.local'
  ON CONFLICT DO NOTHING;

  INSERT INTO coffees (shop_id, name, slug, description, origin_country_id, variety_id, processing_method_id,
                       roast_level, flavor_notes, producer, region, altitude_min_m, altitude_max_m,
                       harvest_year, brew_method, is_published)
  SELECT sh.id, c.coffee_name,
         'ref-' || c.shop_slug || '-' || left(md5(c.coffee_name), 10),
         'Reference listing. Source: ' || c.source_url || ' (checked ' || c.checked_on || ').',
         reference_origin_id(c.origin_raw),
         reference_variety_id(c.variety_raw),
         reference_process_id(c.process_raw),
         c.roast_level, c.flavor_notes, left(btrim(c.producer), 100), left(btrim(c.region), 100),
         c.altitude_min_m, c.altitude_max_m, c.harvest_year, c.brew_method, true
  FROM reference_catalogue c
  JOIN shops sh ON sh.slug = 'ref-' || c.shop_slug
  WHERE reference_origin_id(c.origin_raw) IS NOT NULL
    AND reference_process_id(c.process_raw) IS NOT NULL
  ORDER BY c.shop_slug, c.coffee_name
  ON CONFLICT (slug) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

-- ─── Data ────────────────────────────────────────────────────────────────────

INSERT INTO reference_shops (slug, name, source_url) VALUES
  ('lab19', 'Lab19',        'https://lab19coffee.com/'),
  ('sey',   'SEY Coffee',   'https://www.seycoffee.com/'),
  ('poma',  'Poma Coffee',  'https://pomacoffee.com/'),
  ('onyx',  'Onyx Coffee Lab', 'https://onyxcoffeelab.com/')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO reference_aliases (kind, alias, canonical) VALUES
  ('origin',  'PNG',                  'Papua New Guinea'),
  ('origin',  'Yunnan',               'China (Yunnan)'),
  ('origin',  'China',                'China (Yunnan)'),
  ('origin',  'Sumatra',              'Indonesia'),
  ('variety', 'Gesha',                'Geisha'),
  ('variety', 'Geisha (Gesha)',       'Geisha'),
  ('variety', 'SL-28',                'SL28'),
  ('variety', 'SL 28',                'SL28'),
  ('variety', 'SL-34',                'SL34'),
  ('variety', 'SL 34',                'SL34'),
  ('variety', 'Ruiru-11',             'Ruiru 11'),
  ('variety', 'Catuaí',               'Catuai'),
  ('variety', 'Ethiopian Heirloom',   'Heirloom'),
  ('variety', 'Ethiopian Landrace',   'Heirloom'),
  ('variety', 'Ethiopian Landraces',  'Heirloom'),
  ('variety', 'Heirloom Varieties',   'Heirloom'),
  ('variety', 'IH90',                 'IHCAFE 90'),
  ('variety', 'Ihcafe-90',            'IHCAFE 90'),
  ('process', 'Fully Washed',         'Washed'),
  ('process', 'Washed Process',       'Washed'),
  ('process', 'Natural Process',      'Natural'),
  ('process', 'Dry Process',          'Natural'),
  ('process', 'Honey Process',        'Honey'),
  ('process', 'Giling Basah',         'Wet-Hulled'),
  ('process', 'Wet Hulled',           'Wet-Hulled'),
  ('process', 'Anaerobic Fermentation', 'Anaerobic')
ON CONFLICT (kind, alias) DO NOTHING;

-- Each roaster's list is its own slice (#170 Lab19, #171 SEY, #172 Poma,
-- #173 Onyx) and adds an INSERT INTO reference_catalogue block here, with
-- values copied as printed and source_url / checked_on filled in. Until those
-- land (the roasters' sites aren't reachable from the build sessions yet, #168),
-- the catalogue is empty, no reference shop is created and the gap report is empty.

SELECT reference_load() AS reference_coffees_inserted;

COMMIT;
