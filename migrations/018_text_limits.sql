-- Text length limits in the database, not only in Go (#217): a bug or a second
-- writer can no longer store a 10 MB name. char_length counts characters, like
-- the Go checks (graph/helpers.go cleanText, graph/schema.resolvers.go).
-- Also: a ledger of presigned uploads per shop, for the daily upload budget.

ALTER TABLE users
  ADD CONSTRAINT users_display_name_length CHECK (char_length(display_name) <= 50);

ALTER TABLE shops
  ADD CONSTRAINT shops_name_length        CHECK (char_length(name) <= 80),
  ADD CONSTRAINT shops_description_length CHECK (char_length(description) <= 2000),
  ADD CONSTRAINT shops_city_length        CHECK (char_length(city) <= 40);

ALTER TABLE coffees
  ADD CONSTRAINT coffees_name_length        CHECK (char_length(name) <= 120),
  ADD CONSTRAINT coffees_description_length CHECK (char_length(description) <= 5000);

CREATE TABLE upload_grants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    UUID        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  bytes      BIGINT      NOT NULL CHECK (bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_upload_grants_shop_created ON upload_grants (shop_id, created_at);
