-- Moni Cafe — a coffee's updated_at follows its variants (issue #80)
-- Coffee.updatedAt feeds the sitemap's <lastmod>. Price, stock and option
-- changes live on the variants table, so any insert / update / delete there
-- touches the parent coffee (whose own trigger from migration 002 sets
-- updated_at = now()). When a coffee is deleted, its cascaded variant deletes
-- find no coffee row left to touch, which is a no-op.

CREATE OR REPLACE FUNCTION touch_coffee_from_variant() RETURNS trigger AS $$
BEGIN
  UPDATE coffees SET updated_at = now()
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.coffee_id ELSE NEW.coffee_id END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variants_touch_coffee
  AFTER INSERT OR UPDATE OR DELETE ON variants
  FOR EACH ROW EXECUTE FUNCTION touch_coffee_from_variant();
