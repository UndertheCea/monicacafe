-- 027: stock holds (#310). Each bag a checkout takes is recorded as a hold, so
-- giving it back (cancel, payment expiry, a duplicate callback) happens exactly
-- once: release marks the hold and returns its stock in one statement, and a
-- second release finds nothing to do. Orders (Stage 2, #205) will point at their
-- holds. ON DELETE RESTRICT: an option with holds is archived, never deleted
-- (delete_or_archive_variant, migration 020).

CREATE TABLE stock_holds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  UUID NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ
);

CREATE INDEX stock_holds_variant_idx ON stock_holds (variant_id);
-- Open holds, for the expiry job that will release unpaid ones.
CREATE INDEX stock_holds_open_idx ON stock_holds (created_at) WHERE released_at IS NULL;
