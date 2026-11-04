-- 003: shop coordinates for the /map page.
--
-- * Range CHECKs on lat/lng (defence in depth: updateShop already validates,
--   but seed scripts and future admin tools write here too). NaN is rejected
--   explicitly because it compares as greater than every number in Postgres.
-- * Partial index backing Store.ShopPins (shops that can be drawn on the map).

ALTER TABLE shops
  ADD CONSTRAINT shops_lat_range CHECK (lat IS NULL OR (lat <> 'NaN' AND lat BETWEEN -90 AND 90)),
  ADD CONSTRAINT shops_lng_range CHECK (lng IS NULL OR (lng <> 'NaN' AND lng BETWEEN -180 AND 180));

CREATE INDEX IF NOT EXISTS shops_map_pins_idx
  ON shops (name, id)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
