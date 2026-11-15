-- 026: a stock-only change to an option no longer touches its coffee (#290).
-- Migration 006 made every variant write bump coffees.updated_at, so each sale
-- (ReserveStock) also rewrote and row-locked the parent coffee: all sales of a
-- coffee queued on that one lock for the whole checkout, two checkouts could
-- deadlock on coffee rows, and the sitemap's lastmod moved on every sale.
-- Inserts, deletes and changes to anything but stock (price, availability,
-- archiving, grind, weight) still touch the coffee.

CREATE OR REPLACE FUNCTION touch_coffee_from_variant() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'stock' - 'updated_at') = (to_jsonb(OLD) - 'stock' - 'updated_at') THEN
    RETURN NULL;
  END IF;
  UPDATE coffees SET updated_at = now()
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.coffee_id ELSE NEW.coffee_id END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
