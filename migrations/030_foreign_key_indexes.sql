-- 030: an index behind every foreign key (#555). Postgres checks a child table
-- whenever a parent row is deleted (CASCADE / SET NULL), and without an index on
-- the referencing column that check scans the whole child table:
--   variants.coffee_id    004 dropped the plain index; 020's unique index is
--                         partial (live options only), so it can't serve the
--                         FK check, delete_or_archive_coffee or the export.
--   refresh_tokens        every expired token the hourly prune deletes looks up
--     .replaced_by        rows pointing at it; .user_id was indexed for live
--     .user_id            tokens only, and revoked ones stay until they expire.
--   reports / coffees /   set to NULL when an account is deleted, inside
--   audit_log             DeleteAccount's transaction.
-- The sparse SET NULL columns get partial indexes: `col = $1` implies
-- `col IS NOT NULL`, so the planner can use them. store's
-- TestEveryForeignKeyIndexed keeps future migrations to the same rule.

CREATE INDEX idx_variants_coffee_id ON variants (coffee_id);

CREATE INDEX idx_refresh_tokens_replaced_by ON refresh_tokens (replaced_by)
  WHERE replaced_by IS NOT NULL;
DROP INDEX idx_refresh_tokens_user_id;
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE INDEX idx_reports_reporter_id ON reports (reporter_id) WHERE reporter_id IS NOT NULL;
CREATE INDEX idx_reports_handled_by ON reports (handled_by) WHERE handled_by IS NOT NULL;
CREATE INDEX idx_coffees_removed_by ON coffees (removed_by) WHERE removed_by IS NOT NULL;
CREATE INDEX idx_audit_log_actor_id ON audit_log (actor_id) WHERE actor_id IS NOT NULL;
