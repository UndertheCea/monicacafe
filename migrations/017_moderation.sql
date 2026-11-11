-- Moni Cafe — moderation, part 1 (#224).
--
-- suspended_at: an admin took the account / shop off the site. NULL = active.
-- A suspended user can't sign in and their comments are hidden; a suspended
-- shop and its coffees disappear from every public query.
--
-- token_version: bumped whenever existing access tokens must stop working for
-- writes (password change, sign out everywhere, suspension, role change). The
-- access token carries it and mutations compare it with this column.
--
-- audit_log: one row per moderation or account-security action, written in the
-- same transaction as the action. Application code only ever INSERTs here.

ALTER TABLE users
  ADD COLUMN suspended_at  TIMESTAMPTZ,
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE shops ADD COLUMN suspended_at TIMESTAMPTZ;

-- Public queries exclude suspended shops with "NOT IN (suspended shops)"; the
-- partial indexes keep those lookups tiny however many shops there are.
CREATE INDEX idx_shops_suspended ON shops (id) WHERE suspended_at IS NOT NULL;
CREATE INDEX idx_users_suspended ON users (id) WHERE suspended_at IS NOT NULL;

CREATE TABLE audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL when the actor's account was deleted later (or for CLI actions).
  actor_id    UUID        REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT        NOT NULL CHECK (char_length(action) BETWEEN 1 AND 50),
  target_type TEXT        NOT NULL CHECK (target_type IN ('USER', 'SHOP', 'COFFEE', 'COMMENT')),
  -- Not a foreign key: the record must outlive the thing it describes.
  target_id   UUID        NOT NULL,
  reason      TEXT        NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC, id);
CREATE INDEX idx_audit_log_target ON audit_log (target_type, target_id);

-- The log is append-only: rows can't be deleted, and the only allowed update is
-- the foreign key's own ON DELETE SET NULL when an actor's account goes.
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL
     AND (NEW.id, NEW.action, NEW.target_type, NEW.target_id, NEW.reason, NEW.created_at)
         IS NOT DISTINCT FROM (OLD.id, OLD.action, OLD.target_type, OLD.target_id, OLD.reason, OLD.created_at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END $$;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
