-- Moni Cafe — the seller's order for a shop's coffees (issue #161, owner
-- decision #158: shop pages are curated by the seller, not sorted by buyers).
--
-- shop_position is the coffee's place in its shop's lineup (1 = first). It is
-- not unique: reorderShopCoffees rewrites every position of a shop in one
-- transaction, and ties (only possible from concurrent inserts) fall back to
-- newest first.

ALTER TABLE coffees ADD COLUMN shop_position INTEGER;

-- Reordering isn't an edit of the coffee: an update that moves a coffee in its
-- lineup leaves updated_at (the sitemap's <lastmod>) alone. Only
-- reorderShopCoffees changes shop_position, and it changes nothing else.
DROP TRIGGER trg_coffees_updated_at ON coffees;
CREATE TRIGGER trg_coffees_updated_at BEFORE UPDATE ON coffees FOR EACH ROW
  WHEN (OLD.shop_position IS NOT DISTINCT FROM NEW.shop_position)
  EXECUTE FUNCTION set_updated_at();

-- Keep today's order: newest first.
UPDATE coffees c SET shop_position = r.pos
FROM (
  SELECT id, row_number() OVER (PARTITION BY shop_id ORDER BY created_at DESC, id) AS pos
  FROM coffees
) r
WHERE r.id = c.id;

-- New and duplicated coffees (and seed rows) go to the end of their shop's
-- lineup unless the insert names a position. A row-level BEFORE trigger sees
-- the rows a multi-row INSERT has already added, so a seed batch keeps its order.
CREATE FUNCTION coffees_default_shop_position() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shop_position IS NULL THEN
    SELECT COALESCE(max(shop_position), 0) + 1 INTO NEW.shop_position
    FROM coffees WHERE shop_id = NEW.shop_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coffees_shop_position
  BEFORE INSERT ON coffees
  FOR EACH ROW EXECUTE FUNCTION coffees_default_shop_position();

ALTER TABLE coffees ALTER COLUMN shop_position SET NOT NULL;

CREATE INDEX idx_coffees_shop_position ON coffees (shop_id, shop_position);
