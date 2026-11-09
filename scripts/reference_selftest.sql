-- Self-test for the reference-shop seed (issue #169). CI runs it after
-- scripts/seed_reference.sql, then scripts/remove_reference_shops.sql, then
-- checks nothing is left. It COMMITS fixture rows (made-up coffees for the
-- sey / onyx slugs), so run it only on a throwaway database.
--
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f scripts/reference_selftest.sql

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO reference_catalogue (shop_slug, coffee_name, origin_raw, variety_raw, process_raw, producer,
                                 altitude_min_m, altitude_max_m, harvest_year, roast_level, brew_method,
                                 flavor_notes, source_url, checked_on) VALUES
  -- Matches on the English name (case / spaces ignored) and a variety alias.
  ('sey', 'Selftest A', ' ethiopia ', 'Gesha', 'WASHED', 'Selftest Farm', 1900, 2100, 2025, 'LIGHT', 'FILTER',
   '{jasmine}', 'https://example.test/a', '2026-11-09'),
  -- Matches on the Chinese origin name and a process alias; unknown variety → inserted without one.
  ('sey', 'Selftest B', '衣索比亞', 'Sidra', 'Natural   Process', '', NULL, NULL, NULL, 'LIGHT', NULL,
   '{}', 'https://example.test/b', '2026-11-09'),
  -- Unknown origin → skipped.
  ('sey', 'Selftest C', 'Mexico', NULL, 'Washed', '', NULL, NULL, NULL, 'LIGHT', NULL,
   '{}', 'https://example.test/c', '2026-11-09'),
  -- Unknown process → skipped.
  ('sey', 'Selftest D', 'Colombia', 'Caturra', 'Thermal Shock', '', NULL, NULL, NULL, 'LIGHT', NULL,
   '{}', 'https://example.test/d', '2026-11-09'),
  -- Same unknown variety at another shop (one gap row, both shops); Chinese process name.
  ('onyx', 'Selftest E', 'colombia', 'sidra', '水洗', '', NULL, NULL, NULL, 'MEDIUM', 'OMNI',
   '{}', 'https://example.test/e', '2026-11-09');

DO $$
DECLARE
  n INTEGER;
  r RECORD;
BEGIN
  n := reference_load();
  ASSERT n = 3, format('reference_load inserted %s coffees, want 3 (A, B, E)', n);
  ASSERT reference_load() = 0, 'a second reference_load must insert nothing';

  ASSERT (SELECT count(*) FROM shops WHERE slug IN ('ref-sey', 'ref-onyx')) = 2, 'ref-sey and ref-onyx exist';
  ASSERT NOT EXISTS (SELECT 1 FROM shops WHERE slug IN ('ref-lab19', 'ref-poma')), 'shops without catalogue rows are not created';
  ASSERT (SELECT name FROM shops WHERE slug = 'ref-sey') = 'SEY Coffee（參考）', 'shop name ends in （參考）';
  ASSERT (SELECT description FROM shops WHERE slug = 'ref-sey') LIKE 'Reference catalogue for tracking coffee types; not a seller on Moni Cafe.%',
    'shop description says it is not a seller';
  ASSERT (SELECT u.email || ' ' || u.password_hash FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.slug = 'ref-sey')
    = 'reference+sey@monicacafe.local !disabled', 'owned by a reference account that cannot log in';

  SELECT o.name_en AS origin, v.name AS variety, p.name_en AS process, c.producer, c.altitude_max_m,
         c.harvest_year, c.brew_method, c.is_published, c.image_urls,
         (SELECT count(*) FROM variants WHERE coffee_id = c.id) AS options
    INTO r
  FROM coffees c JOIN shops s ON s.id = c.shop_id
  JOIN origin_countries o ON o.id = c.origin_country_id
  JOIN processing_methods p ON p.id = c.processing_method_id
  LEFT JOIN coffee_varieties v ON v.id = c.variety_id
  WHERE s.slug = 'ref-sey' AND c.name = 'Selftest A';
  ASSERT r.origin = 'Ethiopia' AND r.variety = 'Geisha' AND r.process = 'Washed', format('A matched as %s', r);
  ASSERT r.producer = 'Selftest Farm' AND r.altitude_max_m = 2100 AND r.harvest_year = 2025 AND r.brew_method = 'FILTER'
    AND r.is_published AND r.image_urls = '{}' AND r.options = 0, format('A fields: %s', r);

  ASSERT (SELECT variety_id IS NULL FROM coffees WHERE name = 'Selftest B'), 'B has no variety';
  ASSERT (SELECT p.name_en FROM coffees c JOIN processing_methods p ON p.id = c.processing_method_id WHERE c.name = 'Selftest B') = 'Natural',
    'B process via alias';
  ASSERT NOT EXISTS (SELECT 1 FROM coffees WHERE name IN ('Selftest C', 'Selftest D')), 'C and D are skipped';

  ASSERT (SELECT count(*) FROM reference_gaps) = 3, format('gaps: %s', (SELECT string_agg(kind || '=' || value, ', ') FROM reference_gaps));
  ASSERT EXISTS (SELECT 1 FROM reference_gaps WHERE kind = 'origin' AND value = 'Mexico' AND skipped AND coffees = 'sey: Selftest C'), 'origin gap';
  ASSERT EXISTS (SELECT 1 FROM reference_gaps WHERE kind = 'process' AND value = 'Thermal Shock' AND skipped), 'process gap';
  ASSERT EXISTS (SELECT 1 FROM reference_gaps WHERE kind = 'variety' AND lower(value) = 'sidra' AND NOT skipped AND shops = 'onyx, sey'),
    'variety gap, both shops, coffee kept';
END;
$$;

COMMIT;

\echo 'reference self-test: ok'
