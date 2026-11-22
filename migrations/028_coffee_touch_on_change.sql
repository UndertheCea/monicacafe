-- 028: a coffee's updated_at (Coffee.updatedAt, the sitemap's <lastmod>) moves
-- only when the row actually changes (#467). Re-saving the same values,
-- publishing a published coffee or unpublishing a draft used to re-stamp it.
-- Reordering still leaves it alone (migration 014); a variant write still
-- touches it, because touch_coffee_from_variant sets updated_at itself
-- (migrations 006 / 026), which is a change.
DROP TRIGGER trg_coffees_updated_at ON coffees;
CREATE TRIGGER trg_coffees_updated_at BEFORE UPDATE ON coffees FOR EACH ROW
  WHEN (OLD.shop_position IS NOT DISTINCT FROM NEW.shop_position AND OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION set_updated_at();
