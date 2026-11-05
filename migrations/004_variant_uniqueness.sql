-- 004: one variant per (coffee, grind, weight).
--
-- createCoffee already rejects duplicate grind+weight pairs in its input, but
-- variants can now be added one at a time (addVariant), so the database
-- enforces the rule to stay correct under concurrent requests. The unique index
-- also serves coffee_id lookups, so the old single-column index is dropped.

-- Remove any duplicates left by earlier data, keeping the oldest row.
DELETE FROM variants v
USING variants older
WHERE v.coffee_id = older.coffee_id
  AND v.grind = older.grind
  AND v.weight_g = older.weight_g
  AND (older.created_at, older.id) < (v.created_at, v.id);

CREATE UNIQUE INDEX variants_coffee_grind_weight_key ON variants (coffee_id, grind, weight_g);
DROP INDEX IF EXISTS idx_variants_coffee_id;
