-- Moni Cafe — auth sessions + integrity constraints
-- Adds server-side refresh-token tracking (rotation + revocation on logout),
-- enforces one shop per seller, and keeps updated_at columns current.

-- ─── Refresh tokens ───────────────────────────────────────────────────────────
-- Only the SHA-256 hash of each refresh token's JTI is stored. A refresh token is
-- valid only while its row exists, is unrevoked, and has not expired. Every
-- refresh rotates the token (old row revoked, new row inserted).

CREATE TABLE refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- ─── Constraints ──────────────────────────────────────────────────────────────

-- A seller owns exactly one shop.
DROP INDEX IF EXISTS idx_shops_owner_id;
ALTER TABLE shops ADD CONSTRAINT shops_owner_id_key UNIQUE (owner_id);

-- Slugs are URL-safe lowercase ASCII.
ALTER TABLE shops   ADD CONSTRAINT shops_slug_format   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE coffees ADD CONSTRAINT coffees_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Flavor-note lookups (`'berry' = ANY(flavor_notes)`) and newest-first listings.
CREATE INDEX idx_coffees_flavor_notes ON coffees USING GIN (flavor_notes);
CREATE INDEX idx_coffees_published_created ON coffees (created_at DESC) WHERE is_published;
CREATE INDEX idx_comments_coffee_created ON comments (coffee_id, created_at DESC);

-- ─── updated_at maintenance ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shops_updated_at   BEFORE UPDATE ON shops   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_coffees_updated_at BEFORE UPDATE ON coffees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
