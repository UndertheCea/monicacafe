-- 029: indexes for the hourly prunes (#524). store.PruneRefreshTokens deletes
-- refresh tokens WHERE expires_at < now() in batches, and the cart sweep deletes
-- cart_items WHERE updated_at < now() - ttl. Without these, the last batch of
-- every run (fewer rows than the batch size) scans the whole table, and
-- refresh_tokens grows with every page load.

CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
CREATE INDEX idx_cart_items_updated_at ON cart_items (updated_at);
