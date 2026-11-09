-- Moni Cafe — remove the reference shops (issue #169) before launch, or any time.
--
--   psql "$DATABASE_URL" -f scripts/remove_reference_shops.sql
--
-- Deletes every shop owned by a reference+…@monicacafe.local account with its
-- coffees (their options, comments and saves cascade), the shops' follows, the
-- reference accounts, and the staging tables, view and functions that
-- scripts/seed_reference.sql created. Real sellers' data is untouched. Safe to
-- run on a database that never had reference shops.

BEGIN;

CREATE TEMP TABLE ref_users ON COMMIT DROP AS
  SELECT id FROM users WHERE email LIKE 'reference+%@monicacafe.local';

DELETE FROM coffees WHERE shop_id IN (SELECT id FROM shops WHERE owner_id IN (SELECT id FROM ref_users));
DELETE FROM shops   WHERE owner_id IN (SELECT id FROM ref_users);
DELETE FROM users   WHERE id IN (SELECT id FROM ref_users);

DROP VIEW     IF EXISTS reference_gaps;
DROP FUNCTION IF EXISTS reference_load();
DROP FUNCTION IF EXISTS reference_origin_id(TEXT);
DROP FUNCTION IF EXISTS reference_variety_id(TEXT);
DROP FUNCTION IF EXISTS reference_process_id(TEXT);
DROP FUNCTION IF EXISTS reference_norm(TEXT);
DROP TABLE    IF EXISTS reference_catalogue;
DROP TABLE    IF EXISTS reference_aliases;
DROP TABLE    IF EXISTS reference_shops;

COMMIT;
