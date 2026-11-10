-- Moni Cafe — remove the cup profile (owner's answer on #176, issue #189)
-- The owner: "cup profile just delete (if a shop owner wants that, it should be
-- written in the description)". Drops migration 013's columns, CHECKs and index.

DROP INDEX IF EXISTS idx_coffees_acidity;

ALTER TABLE coffees
  DROP CONSTRAINT IF EXISTS coffees_acidity_range,
  DROP CONSTRAINT IF EXISTS coffees_sweetness_range,
  DROP CONSTRAINT IF EXISTS coffees_body_range,
  DROP COLUMN IF EXISTS acidity,
  DROP COLUMN IF EXISTS sweetness,
  DROP COLUMN IF EXISTS body;
