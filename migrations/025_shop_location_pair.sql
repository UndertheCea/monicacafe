-- 025: a shop's location is a pair (#295). updateShop now sets or clears lat
-- and lng together; this keeps any other writer (seeds, admin tools) honest.
-- Half-set rows (none are expected) lose the lone half rather than guessing.
UPDATE shops SET lat = NULL, lng = NULL WHERE (lat IS NULL) <> (lng IS NULL);

ALTER TABLE shops ADD CONSTRAINT shops_location_pair CHECK ((lat IS NULL) = (lng IS NULL));
