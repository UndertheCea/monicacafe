-- 003: range CHECKs on shop coordinates (defence in depth for the /map page).
-- updateShop already validates, but seed scripts and future admin tools write
-- here too. NaN is rejected explicitly because Postgres sorts it above every
-- number, so a BETWEEN check alone would not catch it.

ALTER TABLE shops
  ADD CONSTRAINT shops_lat_range CHECK (lat IS NULL OR (lat <> 'NaN' AND lat BETWEEN -90 AND 90)),
  ADD CONSTRAINT shops_lng_range CHECK (lng IS NULL OR (lng <> 'NaN' AND lng BETWEEN -180 AND 180));
