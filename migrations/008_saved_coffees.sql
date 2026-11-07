-- Moni Cafe — saved coffees (issue #87)
-- A signed-in user's bookmarks. One row per (user, coffee); both sides cascade,
-- so deleting an account or a draft coffee takes its saves with it.

CREATE TABLE saved_coffees (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coffee_id  UUID        NOT NULL REFERENCES coffees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, coffee_id)
);

-- (user_id, coffee_id) is covered by the UNIQUE index; counts go by coffee.
CREATE INDEX idx_saved_coffees_coffee_id ON saved_coffees (coffee_id);
