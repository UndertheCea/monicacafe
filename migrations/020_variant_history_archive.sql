-- Stage 2 groundwork (#278, part of #237): options keep a change time, and
-- options / coffees that orders will point at can be retired instead of
-- deleted. Deletes stay real deletes while nothing references the row; the
-- store archives only when a foreign key (future order lines, ON DELETE
-- RESTRICT) refuses the delete.

ALTER TABLE variants
  ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN archived_at TIMESTAMPTZ;

-- An archived option can never be bought again.
ALTER TABLE variants
  ADD CONSTRAINT variants_archived_unavailable CHECK (archived_at IS NULL OR NOT is_available);

ALTER TABLE coffees
  ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE coffees
  ADD CONSTRAINT coffees_archived_unpublished CHECK (archived_at IS NULL OR NOT is_published);

-- Grind + weight stay unique among live options only, so a seller can add back
-- an option whose old version is archived.
DROP INDEX variants_coffee_grind_weight_key;
CREATE UNIQUE INDEX variants_coffee_grind_weight_key
  ON variants (coffee_id, grind, weight_g) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION touch_variant_updated_at() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.price_twd, NEW.stock, NEW.is_available, NEW.archived_at)
     IS DISTINCT FROM ROW(OLD.price_twd, OLD.stock, OLD.is_available, OLD.archived_at) THEN
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variants_updated_at
  BEFORE UPDATE ON variants
  FOR EACH ROW EXECUTE FUNCTION touch_variant_updated_at();

-- Delete an option, or archive it when something still references it (a
-- foreign key refuses the delete). Returns 'deleted', 'archived', or NULL when
-- there is no live option with that id. The EXCEPTION block runs the delete in
-- a subtransaction, so this works inside or outside a caller's transaction.
CREATE OR REPLACE FUNCTION delete_or_archive_variant(vid uuid) RETURNS text AS $$
BEGIN
  BEGIN
    DELETE FROM variants WHERE id = vid AND archived_at IS NULL;
    IF FOUND THEN
      RETURN 'deleted';
    END IF;
    RETURN NULL;
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE variants SET archived_at = now(), is_available = false
    WHERE id = vid AND archived_at IS NULL;
    RETURN 'archived';
  END;
END;
$$ LANGUAGE plpgsql;

-- Same for a coffee: its options and comments cascade on a real delete; when an
-- option is still referenced the coffee is unpublished and archived with all of
-- its options instead.
CREATE OR REPLACE FUNCTION delete_or_archive_coffee(cid uuid) RETURNS text AS $$
BEGIN
  BEGIN
    DELETE FROM coffees WHERE id = cid AND archived_at IS NULL;
    IF FOUND THEN
      RETURN 'deleted';
    END IF;
    RETURN NULL;
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE coffees SET archived_at = now(), is_published = false
    WHERE id = cid AND archived_at IS NULL;
    UPDATE variants SET archived_at = now(), is_available = false
    WHERE coffee_id = cid AND archived_at IS NULL;
    RETURN 'archived';
  END;
END;
$$ LANGUAGE plpgsql;
