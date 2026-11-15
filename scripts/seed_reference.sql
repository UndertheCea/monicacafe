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

-- A made-up Taiwan city and pin per reference shop, so they show on /map and
-- in the city line like real shops (owner, 2026-11-14). The real roasters are
-- mostly abroad; these are placeholders, picked near a town centre so the pin
-- lands on land. ADD COLUMN IF NOT EXISTS keeps re-runs on older dev DBs working.
ALTER TABLE reference_shops
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lat  DOUBLE PRECISION CHECK (lat IS NULL OR lat BETWEEN 21.8 AND 25.4),
  ADD COLUMN IF NOT EXISTS lng  DOUBLE PRECISION CHECK (lng IS NULL OR lng BETWEEN 119.9 AND 122.1);

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

-- Columns added after #169 (the first real lists, #170–#173 / #299–#303). The
-- roasters' files are JSON arrays (docs/reference-data/); reference_add() below
-- loads one shop's array as printed. A few coffees print no country (Poma's
-- b2b listings) or no process (Coffee Collective's Espresso Blend), and many
-- print no roast, so those columns allow NULL; blends are flagged. ALTER ... IF
-- NOT EXISTS / DROP NOT NULL keep re-runs on older dev databases working.
ALTER TABLE reference_catalogue
  ALTER COLUMN origin_raw  DROP NOT NULL,
  ALTER COLUMN process_raw DROP NOT NULL,
  ALTER COLUMN roast_level DROP NOT NULL,
  ALTER COLUMN roast_level DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS blend BOOLEAN NOT NULL DEFAULT false;

-- Spelling variants of values we already have. A genuinely new value belongs
-- in a migration (#174), not here.
CREATE TABLE IF NOT EXISTS reference_aliases (
  kind      TEXT NOT NULL CHECK (kind IN ('origin', 'variety', 'process')),
  alias     TEXT NOT NULL,
  canonical TEXT NOT NULL, -- origin_countries.name_en / coffee_varieties.name / processing_methods.name_en
  PRIMARY KEY (kind, alias)
);

-- Raw values we've looked at and deliberately don't map: blends that print
-- several countries (a listing has one origin), a "country" that is really a
-- region or a lab, or a coffee that prints none. Each needs a reason. They stay
-- in the reference_gaps view (accepted = true) but don't fail `--strict`, so a
-- new roaster list with an unreviewed value still does. value '' = not printed.
CREATE TABLE IF NOT EXISTS reference_accepted_gaps (
  kind   TEXT NOT NULL CHECK (kind IN ('origin', 'variety', 'process')),
  value  TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
  PRIMARY KEY (kind, value)
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
-- only leaves the coffee without a variety. A value the roaster didn't print
-- shows as '' ("accepted" if reference_accepted_gaps lists it).
-- DROP first: CREATE OR REPLACE VIEW can't add the "accepted" column in place.
DROP VIEW IF EXISTS reference_gaps;
CREATE VIEW reference_gaps AS
WITH raw AS (
  SELECT 'origin' AS kind, coalesce(origin_raw, '') AS value, shop_slug, coffee_name,
         reference_origin_id(origin_raw) IS NULL AS missing, true AS skips
  FROM reference_catalogue
  UNION ALL
  SELECT 'variety', variety_raw, shop_slug, coffee_name,
         reference_variety_id(variety_raw) IS NULL, false
  FROM reference_catalogue WHERE NULLIF(btrim(variety_raw), '') IS NOT NULL
  UNION ALL
  SELECT 'process', coalesce(process_raw, ''), shop_slug, coffee_name,
         reference_process_id(process_raw) IS NULL, true
  FROM reference_catalogue
)
SELECT kind,
       min(btrim(value)) AS value,
       string_agg(DISTINCT shop_slug, ', ' ORDER BY shop_slug) AS shops,
       string_agg(shop_slug || ': ' || coffee_name, '; ' ORDER BY shop_slug, coffee_name) AS coffees,
       bool_or(skips) AS skipped,
       EXISTS (SELECT 1 FROM reference_accepted_gaps a
               WHERE a.kind = raw.kind AND reference_norm(a.value) = reference_norm(min(raw.value))) AS accepted
FROM raw
WHERE missing
GROUP BY kind, reference_norm(value)
ORDER BY kind, min(btrim(value));

-- Loads one roaster's list, as exported in docs/reference-data/<file>.md (a
-- JSON array of reference_catalogue fields; "blend" optional). Re-running
-- replaces nothing: a coffee already in the catalogue keeps its row.
CREATE OR REPLACE FUNCTION reference_add(slug TEXT, coffees JSONB) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  added INTEGER;
BEGIN
  INSERT INTO reference_catalogue (shop_slug, coffee_name, origin_raw, variety_raw, process_raw, producer, region,
                                   altitude_min_m, altitude_max_m, harvest_year, roast_level, brew_method,
                                   flavor_notes, source_url, checked_on, blend)
  SELECT slug, r.coffee_name, NULLIF(btrim(r.origin_raw), ''), NULLIF(btrim(r.variety_raw), ''),
         NULLIF(btrim(r.process_raw), ''), coalesce(r.producer, ''), coalesce(r.region, ''),
         r.altitude_min_m, r.altitude_max_m, r.harvest_year, r.roast_level::roast_level, r.brew_method,
         coalesce(ARRAY(SELECT jsonb_array_elements_text(r.flavor_notes)), '{}'),
         r.source_url, r.checked_on, coalesce(r.blend, false)
  FROM jsonb_to_recordset(coffees) AS r(coffee_name TEXT, origin_raw TEXT, variety_raw TEXT, process_raw TEXT,
                                       producer TEXT, region TEXT, altitude_min_m INTEGER, altitude_max_m INTEGER,
                                       harvest_year INTEGER, roast_level TEXT, brew_method TEXT,
                                       flavor_notes JSONB, source_url TEXT, checked_on DATE, blend BOOLEAN)
  ON CONFLICT (shop_slug, coffee_name) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END;
$$;

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

  INSERT INTO shops (owner_id, slug, name, description, city, lat, lng)
  SELECT u.id, 'ref-' || s.slug, s.name || '（參考）',
         'Reference catalogue for tracking coffee types; not a seller on Moni Cafe. 參考目錄，用來追蹤咖啡種類；並非 Moni Cafe 的賣家。',
         s.city, s.lat, s.lng
  FROM reference_shops s
  JOIN users u ON u.email = 'reference+' || s.slug || '@monicacafe.local'
  ON CONFLICT DO NOTHING;

  -- Shops created by an older version of this script have no location yet.
  UPDATE shops sh SET city = s.city, lat = s.lat, lng = s.lng
  FROM reference_shops s
  WHERE sh.slug = 'ref-' || s.slug AND sh.lat IS NULL AND s.lat IS NOT NULL;

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

-- #170–#173 and #299–#303. Cities and pins are placeholders (see above).
INSERT INTO reference_shops (slug, name, source_url, city, lat, lng) VALUES
  ('lab19',            'Lab19',             'https://lab19coffee.com/',            '台北市', 25.0418, 121.5440),
  ('sey',              'SEY Coffee',        'https://www.seycoffee.com/',          '新竹市', 24.8040, 120.9690),
  ('poma',             'Poma Coffee',       'https://pomacoffee.com/',             '台中市', 24.1490, 120.6650),
  ('onyx',             'Onyx Coffee Lab',   'https://onyxcoffeelab.com/',          '高雄市', 22.6270, 120.3010),
  ('coffeecollective', 'Coffee Collective', 'https://coffeecollective.dk/',        '台南市', 22.9930, 120.2040),
  ('lacabra',          'La Cabra',          'https://us.lacabra.com/',             '花蓮縣', 23.9770, 121.6040),
  ('september',        'September',         'https://september.coffee/',           '宜蘭縣', 24.7570, 121.7530),
  ('philsebastian',    'Phil & Sebastian',  'https://philsebastian.com/',          '嘉義市', 23.4800, 120.4490),
  ('monogram',         'Monogram',          'https://monogramcoffee.com/',         '台東縣', 22.7560, 121.1450)
ON CONFLICT (slug) DO UPDATE SET city = EXCLUDED.city, lat = EXCLUDED.lat, lng = EXCLUDED.lng;

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

-- Each roaster's list is its own slice and its own block below: the JSON array
-- from docs/reference-data/<file>.md (collected by the owner on 2026-11-13,
-- #168 (b)), one coffee per line, values as printed. The file's "Uncertain /
-- notes" list explains the judgement calls. To refresh a list, replace its
-- array; to add a roaster, add a reference_shops row and a block.

-- Lab19 (#170): docs/reference-data/170-lab19-reference.md, 21 coffees.
SELECT reference_add('lab19', $lab19$[
  {"coffee_name": "Colombia La Negrita JBRC Champion Lot.21 (15g)", "origin_raw": "Colombia", "variety_raw": "Red Geisha", "process_raw": "Nitrogen Flushed Natural", "producer": "", "region": "Tolima", "altitude_min_m": 1800, "altitude_max_m": 2000, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Orange Blossom", "Grape", "Cranberry", "Citrus", "Lactic"], "source_url": "https://lab19coffee.com/products/colombia-la-negrita-jbrc-champion-lot-21-15g", "checked_on": "2026-11-13"},
  {"coffee_name": "Panama Lost Origin X Gales 369(15g)", "origin_raw": "Panama", "variety_raw": "Geisha", "process_raw": "Yeast Natural", "producer": "", "region": "Bambito Volcan", "altitude_min_m": 1700, "altitude_max_m": 1800, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Orange Blossom", "Pineapple", "White Grape", "Honeydew", "Raspberry"], "source_url": "https://lab19coffee.com/products/panama-lost-origin-x-gales-36915g", "checked_on": "2026-11-13"},
  {"coffee_name": "Panama  Lost Origin X  Juruntugo 336(15g)", "origin_raw": "Panama", "variety_raw": "Geisha", "process_raw": "Yeast Natural", "producer": "", "region": "Juruntugo", "altitude_min_m": 1750, "altitude_max_m": 1800, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Raspberry", "Coffee Blossom", "Blackberry", "Orange", "Pineapple", "Grape"], "source_url": "https://lab19coffee.com/products/lost-origin-x-juruntugo-336", "checked_on": "2026-11-13"},
  {"coffee_name": "Panama Lost Origin X Gales 372(15g)", "origin_raw": "Panama", "variety_raw": "Geisha", "process_raw": "Yeast Natural", "producer": "", "region": "Bambito Volcan", "altitude_min_m": 1700, "altitude_max_m": 1800, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Pineapple", "Natural Wine", "White Grape", "Violet"], "source_url": "https://lab19coffee.com/products/lost-origin-x-gales-372", "checked_on": "2026-11-13"},
  {"coffee_name": "Panama Tri-Up Project \"Dazzle\" Lactic Washed", "origin_raw": "Panama", "variety_raw": "Geisha", "process_raw": "Lactic Washed", "producer": "", "region": "Boquete", "altitude_min_m": 1600, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Jasmine", "Bergamot", "Peach", "Strawberry"], "source_url": "https://lab19coffee.com/products/panama-tri-up-project-dazzle", "checked_on": "2026-11-13"},
  {"coffee_name": "Panama \" Liuli 琉璃 \" Geisha Piled Natural", "origin_raw": "Panama", "variety_raw": "Geisha", "process_raw": "堆疊日曬 Piled Natural", "producer": "", "region": "Boquete", "altitude_min_m": 1600, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Passionfruit", "Strawberry", "Blueberry", "Grape", "Hibiscus"], "source_url": "https://lab19coffee.com/products/panama-geisha-liuli-piled-natural-副本", "checked_on": "2026-11-13"},
  {"coffee_name": "Ethiopia Mewa Premium Washed", "origin_raw": "Ethiopia", "variety_raw": "Helena Forest Heirloom", "process_raw": "Washed", "producer": "", "region": "West Arsi", "altitude_min_m": 2220, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Orange", "Peach", "Red Plum", "Milk Tea"], "source_url": "https://lab19coffee.com/products/ethiopia-mewa-premium-washed-水洗", "checked_on": "2026-11-13"},
  {"coffee_name": "Ethiopia Bombe Washed", "origin_raw": "Ethiopia", "variety_raw": "74110", "process_raw": "Washed", "producer": "", "region": "Bombe Village, Bensa", "altitude_min_m": 2200, "altitude_max_m": 2400, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Jasmine", "Mandarin", "Apricot", "Bergamot"], "source_url": "https://lab19coffee.com/products/ethiopia-bombe-washed", "checked_on": "2026-11-13"},
  {"coffee_name": "Ethiopia Dume Natural", "origin_raw": "Ethiopia", "variety_raw": "74158", "process_raw": "Natural", "producer": "", "region": "Murago", "altitude_min_m": 2350, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Passion Fruit", "Mango", "Blue Berry", "Peach", "Rose"], "source_url": "https://lab19coffee.com/products/ethiopia-dume-natural", "checked_on": "2026-11-13"},
  {"coffee_name": "Kenya Kaliluni AA Washed", "origin_raw": "Kenya", "variety_raw": "SL28, SL34, R11, Batian", "process_raw": "Washed", "producer": "", "region": "Machakos", "altitude_min_m": 1600, "altitude_max_m": 1800, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Currant", "Cranberry", "Orange"], "source_url": "https://lab19coffee.com/products/kenya-kaliluni-aa-washed", "checked_on": "2026-11-13"},
  {"coffee_name": "Kenya Rugi AB Washed", "origin_raw": "Kenya", "variety_raw": "SL28/SL34/R11", "process_raw": "Washed", "producer": "Mutitu Coffee Washing Station (Rugi Cooperative Society)", "region": "Nyeri", "altitude_min_m": 1700, "altitude_max_m": 1800, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Orange", "Currant", "Pear"], "source_url": "https://lab19coffee.com/products/kenya-ngunguru-ab-washed", "checked_on": "2026-11-13"},
  {"coffee_name": "Kenya Njemu AB Washed", "origin_raw": "Kenya", "variety_raw": "SL28/34", "process_raw": "Washed", "producer": "Njemu Estate", "region": "Kirinyaga", "altitude_min_m": 1600, "altitude_max_m": 1800, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Elder Flower", "Red Currant", "Orange"], "source_url": "https://lab19coffee.com/products/kenya-njemu-washed", "checked_on": "2026-11-13"},
  {"coffee_name": "Kenya Njemu Anaerobic Natural", "origin_raw": "Kenya", "variety_raw": "SL28/SL34", "process_raw": "Anaerobic Natural", "producer": "", "region": "Kirinyaga", "altitude_min_m": 1600, "altitude_max_m": 1800, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Banana Pound Cake", "Dried Mango", "Dried Hibiscus", "Berry Jam"], "source_url": "https://lab19coffee.com/products/kenya-njemu-anaerobic-natural", "checked_on": "2026-11-13"},
  {"coffee_name": "Costa Rica V&G Slow Dry Natural", "origin_raw": "Costa Rica", "variety_raw": "H1", "process_raw": "Slow Dry Natural", "producer": "V&G", "region": "West Valley", "altitude_min_m": 1460, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Cranberry", "Grape", "Pineapple", "Hibiscus"], "source_url": "https://lab19coffee.com/products/costa-rica-v-g-honey", "checked_on": "2026-11-13"},
  {"coffee_name": "Bolivia Brenda Palli Washed", "origin_raw": "Bolivia", "variety_raw": "Caturra", "process_raw": "Washed", "producer": "Brenda Palli", "region": "Caranavi", "altitude_min_m": 1500, "altitude_max_m": 1680, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Plum", "Pluot", "Orange", "Cashew"], "source_url": "https://lab19coffee.com/products/bolivia-brenda-palli-washed", "checked_on": "2026-11-13"},
  {"coffee_name": "Bolivia Los Rodriguez Kisa Natural", "origin_raw": "Bolivia", "variety_raw": "Java", "process_raw": "Natural", "producer": "Los Rodriguez", "region": "Samaipata", "altitude_min_m": 1500, "altitude_max_m": 1700, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Magnolia", "Peach", "Cranberry", "Milk Chocolate"], "source_url": "https://lab19coffee.com/products/bolivia-los-rodriguez-kisa-natural", "checked_on": "2026-11-13"},
  {"coffee_name": "Ecuador La Papaya Washed", "origin_raw": "Ecuador", "variety_raw": "Mejorado", "process_raw": "Washed", "producer": "Hacienda La Papaya", "region": "Loja", "altitude_min_m": 1800, "altitude_max_m": 2200, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Chamomile", "Pineapple", "Orange", "Apple"], "source_url": "https://lab19coffee.com/products/ecuador-la-papaya-washed", "checked_on": "2026-11-13"},
  {"coffee_name": "Ecuador La Papaya Oak Barrel Natural", "origin_raw": "Ecuador", "variety_raw": "Mejorado", "process_raw": "Oak Barrel Natural", "producer": "Hacienda La Papaya", "region": "Loja", "altitude_min_m": 1800, "altitude_max_m": 2200, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["Hibiscus", "Apple", "Berry Jam", "Tropical Fruit"], "source_url": "https://lab19coffee.com/products/ecuador-la-papaya-oak-barrel-natural", "checked_on": "2026-11-13"},
  {"coffee_name": "[Gentle-MED]  Ecuador Chito Washed", "origin_raw": "Ecuador", "variety_raw": "Mejorado", "process_raw": "Washed", "producer": "", "region": "Chito, Zamora Chinchipe", "altitude_min_m": 1600, "altitude_max_m": 1700, "harvest_year": null, "roast_level": "MEDIUM", "brew_method": "OMNI", "flavor_notes": ["Citrus", "Brown Sugar", "Red Date", "Oolong Tea", "Purple Grapes", "Stone Fruit", "Chocolate"], "source_url": "https://lab19coffee.com/products/gentle-chi", "checked_on": "2026-11-13"},
  {"coffee_name": "[Gentle-MED] Ethiopia Gerba Washed", "origin_raw": "Ethiopia", "variety_raw": "Heirloom", "process_raw": "Washed", "producer": "", "region": "Guji", "altitude_min_m": 2100, "altitude_max_m": 2300, "harvest_year": null, "roast_level": "MEDIUM", "brew_method": null, "flavor_notes": ["Citrus", "Peach", "Cranberry", "Blueberry"], "source_url": "https://lab19coffee.com/products/gentle-med-ethiopia-gerba-washed", "checked_on": "2026-11-13"},
  {"coffee_name": "[Gentle-Med] Ethiopia Duwancho Natural", "origin_raw": "Ethiopia", "variety_raw": "74110, 74112, 74158", "process_raw": "Natural", "producer": "", "region": "Bensa", "altitude_min_m": 2300, "altitude_max_m": 2350, "harvest_year": null, "roast_level": "MEDIUM", "brew_method": null, "flavor_notes": ["Berries", "Apricot", "Butter", "Chocolate"], "source_url": "https://lab19coffee.com/products/gentle-med-ethiopia-duwancho-natural", "checked_on": "2026-11-13"}
]$lab19$) AS lab19_coffees;

-- SEY (#171): docs/reference-data/171-sey-reference.md, 9 coffees.
SELECT reference_add('sey', $sey$[
  {"coffee_name": "2026 Tamiru Tadesse Tesema; Safo, Washed - Ethiopia", "origin_raw": "Ethiopia", "variety_raw": "74158", "process_raw": "Washed", "producer": "Tamiru Tadesse Tesema", "region": "Alo Village, Bensa, Sidama", "altitude_min_m": 2400, "altitude_max_m": 2550, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["honeysuckle", "bergamot", "nectarine", "silver needle"], "source_url": "https://www.seycoffee.com/products/2026-tamiru-tadesse-tesema-safo-washed-ethiopia", "checked_on": "2026-11-13"},
  {"coffee_name": "2026 Harold Ortiz Ceron; Finca La Cava, Chiroso - Colombia", "origin_raw": "Colombia", "variety_raw": "Chiroso", "process_raw": "Washed", "producer": "Harold Ortiz Ceron", "region": "San Pablo, Nariño", "altitude_min_m": 1760, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["ripe strawberry", "tangerine", "oolong"], "source_url": "https://www.seycoffee.com/products/2026-harold-ortiz-ceron-finca-la-cava-chiroso-colombia", "checked_on": "2026-11-13"},
  {"coffee_name": "2026 Chelbessa; 2nd Selection - Ethiopia", "origin_raw": "Ethiopia", "variety_raw": "Ethiopian Landrace", "process_raw": "Washed", "producer": "Chelbessa", "region": "Gedeb, Gedeo", "altitude_min_m": 2200, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["stone fruit", "citrus", "lemon verbena"], "source_url": "https://www.seycoffee.com/products/2026-chelbessa-2nd-selection-ethiopia", "checked_on": "2026-11-13"},
  {"coffee_name": "2026 Elpidio Tabares; La Soledad - Colombia", "origin_raw": "Colombia", "variety_raw": "Chiroso", "process_raw": "Washed", "producer": "Elpidio Tabares", "region": "Urrao, Antioquia", "altitude_min_m": 1900, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["passion fruit", "lychee", "citrus"], "source_url": "https://www.seycoffee.com/products/2026-elpidio-tabares-la-soledad-colombia", "checked_on": "2026-11-13"},
  {"coffee_name": "2026 Eulises Fabian Quilindo; El Higueron - Colombia", "origin_raw": "Colombia", "variety_raw": "Pink Bourbon", "process_raw": "Washed", "producer": "Eulises Fabian Quilindo", "region": "Santa María, Huila", "altitude_min_m": 1900, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["bright red berries", "lime", "wildflower honey"], "source_url": "https://www.seycoffee.com/products/2026-eulises-fabian-quilindo-el-higueron-colombia", "checked_on": "2026-11-13"},
  {"coffee_name": "2026 Kanzu; Lot #16 - Rwanda", "origin_raw": "Rwanda", "variety_raw": "Bourbon", "process_raw": "Washed", "producer": "Kanzu", "region": "Nyamasheke, Western Province", "altitude_min_m": 2200, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["mulling spices", "orange peel", "baked fruit"], "source_url": "https://www.seycoffee.com/products/2026-kanzu-lot-16-rwanda", "checked_on": "2026-11-13"},
  {"coffee_name": "2026 Luz Stella Rivera; El Oregon - Colombia", "origin_raw": "Colombia", "variety_raw": "Pink Bourbon", "process_raw": "Washed", "producer": "Luz Stella Rivera", "region": "Santa María, Huila", "altitude_min_m": 1750, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["raspberry", "citrus", "wildflower honey"], "source_url": "https://www.seycoffee.com/products/2026-luz-stella-rivera-el-oregon-colombia", "checked_on": "2026-11-13"},
  {"coffee_name": "2026 Harold Ortiz Ceron; Finca La Cava, Pink Bourbon - Colombia", "origin_raw": "Colombia", "variety_raw": "Pink Bourbon", "process_raw": "Washed", "producer": "Harold Ortiz Ceron", "region": "San Pablo, Nariño", "altitude_min_m": 1760, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["blueberry", "blood orange", "raspberry"], "source_url": "https://www.seycoffee.com/products/2026-harold-ortiz-ceron-finca-la-cava-pink-bourbon-colombia", "checked_on": "2026-11-13"},
  {"coffee_name": "Huila Decaffeinated", "origin_raw": "Colombia", "variety_raw": "Caturra, V. Colombia, Castillo", "process_raw": "Washed", "producer": "", "region": "Huila", "altitude_min_m": 1600, "altitude_max_m": 1800, "harvest_year": 2025, "roast_level": null, "brew_method": null, "flavor_notes": ["orange marmalade", "dark chocolate", "strawberry"], "source_url": "https://www.seycoffee.com/products/huila-decaffeinated", "checked_on": "2026-11-13"}
]$sey$) AS sey_coffees;

-- Poma (#172): docs/reference-data/172-poma-reference.md, 18 coffees.
SELECT reference_add('poma', $poma$[
  {"coffee_name": "Finca Soledad - Washed Sydra (Drip Packs)", "origin_raw": "Ecuador", "variety_raw": "Sydra", "process_raw": "Washed", "producer": "Finca Soledad", "region": "", "altitude_min_m": 1515, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["white peach", "plum", "strawberry candy"], "source_url": "https://www.pomacoffee.com/products/finca-soledad-washed-sydra-drip-packs", "checked_on": "2026-11-13"},
  {"coffee_name": "Fincas del Putushio - Washed Typica Mejorado", "origin_raw": null, "variety_raw": "Typica Mejorado", "process_raw": "Washed", "producer": "Fincas del Putushio", "region": "", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["white florals", "peach", "gooseberry", "yellow florals"], "source_url": "https://www.pomacoffee.com/products/finca-soledad-washed-sydra", "checked_on": "2026-11-13"},
  {"coffee_name": "Gesha Village - Illubabor Forest Reserve (Hart)", "origin_raw": "Ethiopia", "variety_raw": "Illubabor", "process_raw": "Washed", "producer": "Gesha Village", "region": "", "altitude_min_m": 2000, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": ["jasmine", "lavendar", "grapefruit zest", "black tea"], "source_url": "https://www.pomacoffee.com/products/gesha-village-illubabor-forest-reserve-hart", "checked_on": "2026-11-13"},
  {"coffee_name": "Gesha Village - Natural 1931 Gesha", "origin_raw": null, "variety_raw": "1931 Gesha", "process_raw": "Natural", "producer": "Gesha Village", "region": "Oma block (lot #144)", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["jasmine", "honey", "ripe mango", "white peach"], "source_url": "https://www.pomacoffee.com/products/gesha-village-natural-1931-gesha", "checked_on": "2026-11-13"},
  {"coffee_name": "Humidity Experiment - Cold Washed Milenio", "origin_raw": "Denmark", "variety_raw": "Milenio", "process_raw": "Cold Washed", "producer": "Poma", "region": "Poma Research Station", "altitude_min_m": 1800, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": [], "source_url": "https://www.pomacoffee.com/products/humidity-experiment", "checked_on": "2026-11-13"},
  {"coffee_name": "Jardines del Edén - Washed Marageisha", "origin_raw": null, "variety_raw": "Marageisha", "process_raw": "Washed", "producer": "", "region": "", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["coffee blossom", "prickly pear", "green tea"], "source_url": "https://www.pomacoffee.com/products/jardines-del-eden-washed-marageisha", "checked_on": "2026-11-13"},
  {"coffee_name": "Las Brisas - Washed Bourbon Aji", "origin_raw": "Colombia", "variety_raw": "Bourbon Ají", "process_raw": "Washed", "producer": "Las Brisas", "region": "southern Huila", "altitude_min_m": 1800, "altitude_max_m": null, "harvest_year": 2025, "roast_level": null, "brew_method": null, "flavor_notes": ["jasmine", "lavender", "elderflower", "brown spice"], "source_url": "https://www.pomacoffee.com/products/las-brisas-bourbon-aji", "checked_on": "2026-11-13"},
  {"coffee_name": "Las Brisas - Washed Papayo", "origin_raw": null, "variety_raw": "Papayo", "process_raw": "Washed", "producer": "Las Brisas", "region": "", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["guava", "coconut", "peach"], "source_url": "https://www.pomacoffee.com/products/las-brisas-washed-bourbon-aji-copy", "checked_on": "2026-11-13"},
  {"coffee_name": "Muthuaini - Washed Domestic Varietals", "origin_raw": "Kenya", "variety_raw": "Domestic Varietals", "process_raw": "Washed", "producer": "Muthuaini Washing Station", "region": "Nyeri", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": [], "source_url": "https://www.pomacoffee.com/products/muthuaini-washed-domestic-varietals", "checked_on": "2026-11-13"},
  {"coffee_name": "Pigmentation Experiment", "origin_raw": "Denmark", "variety_raw": "Orange Caturra and Red Caturra", "process_raw": "Cold Washed", "producer": "Poma", "region": "Poma Research Station", "altitude_min_m": 1800, "altitude_max_m": null, "harvest_year": 2025, "roast_level": null, "brew_method": null, "flavor_notes": [], "source_url": "https://www.pomacoffee.com/products/pigmentation-experiment-caturra", "checked_on": "2026-11-13"},
  {"coffee_name": "Pollination Experiment - SL28 x Geisha", "origin_raw": "Denmark", "variety_raw": "SL28", "process_raw": "Cold Washed", "producer": "Poma", "region": "Poma Research Station", "altitude_min_m": 1800, "altitude_max_m": null, "harvest_year": 2025, "roast_level": null, "brew_method": null, "flavor_notes": [], "source_url": "https://www.pomacoffee.com/products/pollination-experiment-sl28-x-geisha-re-release", "checked_on": "2026-11-13"},
  {"coffee_name": "Pruning Experiment - Cold Washed Rume Sudan", "origin_raw": "Denmark", "variety_raw": "Rume Sudan", "process_raw": "Cold Washed", "producer": "Rasmus Madsen", "region": "Poma Research Station", "altitude_min_m": 1800, "altitude_max_m": null, "harvest_year": 2026, "roast_level": null, "brew_method": null, "flavor_notes": [], "source_url": "https://www.pomacoffee.com/products/pruninf-experiment-sudan-rume", "checked_on": "2026-11-13"},
  {"coffee_name": "POMA Research Station - Cold Washed Pacamara", "origin_raw": "Denmark", "variety_raw": "Pacamara", "process_raw": "Cold Washed", "producer": "", "region": "Poma Research Station", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["orange blossom", "dried apricots"], "source_url": "https://www.pomacoffee.com/products/poma-research-station-cold-washed-typica-copy", "checked_on": "2026-11-13"},
  {"coffee_name": "POMA Research Station - Cold Washed SL28", "origin_raw": "Denmark", "variety_raw": "SL28", "process_raw": "Cold Washed", "producer": "", "region": "Poma Research Station", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["rhubarb", "tangerine", "lilac"], "source_url": "https://www.pomacoffee.com/products/poma-research-station-cold-washed-typica-copy-1", "checked_on": "2026-11-13"},
  {"coffee_name": "POMA Research Station - Cold Washed Typica", "origin_raw": "Denmark", "variety_raw": "Typica", "process_raw": "Cold Washed", "producer": "", "region": "Poma Research Station", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["peach", "pear", "sugarcane"], "source_url": "https://www.pomacoffee.com/products/jardines-del-eden-washed-marageisha-copy", "checked_on": "2026-11-13"},
  {"coffee_name": "San Sebastian - Washed Castillo", "origin_raw": "Colombia", "variety_raw": "Castillo", "process_raw": "Washed", "producer": "San Sebastián", "region": "Cauca", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["green apple", "lemon peel", "nougat"], "source_url": "https://www.pomacoffee.com/products/san-sebastian-washed-castillo", "checked_on": "2026-11-13"},
  {"coffee_name": "Volcán Azul - Washed SL28", "origin_raw": "Costa Rica", "variety_raw": "SL28", "process_raw": "Washed", "producer": "Alejo Castro", "region": "Central Valley", "altitude_min_m": 1600, "altitude_max_m": 1900, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["raspberry", "nectarine"], "source_url": "https://www.pomacoffee.com/products/volcan-azul-washed-sl28", "checked_on": "2026-11-13"},
  {"coffee_name": "Volcancito - Honey Caturra", "origin_raw": "Costa Rica", "variety_raw": "Caturra", "process_raw": "Honey", "producer": "Volcán Azul", "region": "", "altitude_min_m": null, "altitude_max_m": null, "harvest_year": null, "roast_level": null, "brew_method": null, "flavor_notes": ["apricot", "brown spice", "nougat"], "source_url": "https://www.pomacoffee.com/products/volcancito-honey-caturra", "checked_on": "2026-11-13"}
]$poma$) AS poma_coffees;

SELECT reference_load() AS reference_coffees_inserted;

COMMIT;
