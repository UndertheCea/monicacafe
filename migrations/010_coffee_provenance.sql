-- Moni Cafe — coffee provenance (issue #116)
-- Where a coffee comes from beyond its country: the producer (farm, estate,
-- cooperative or washing station), the region inside the country, and the
-- growing altitude in metres — one height (min only) or a min–max range.
-- Blank text means "not given". The CHECKs repeat the GraphQL validation so
-- seeds and future admin tools can't store nonsense either.

ALTER TABLE coffees
  ADD COLUMN producer       TEXT    NOT NULL DEFAULT '',
  ADD COLUMN region         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN altitude_min_m INTEGER,
  ADD COLUMN altitude_max_m INTEGER;

ALTER TABLE coffees
  ADD CONSTRAINT coffees_producer_length CHECK (char_length(producer) <= 100),
  ADD CONSTRAINT coffees_region_length   CHECK (char_length(region) <= 100),
  ADD CONSTRAINT coffees_altitude_range  CHECK (
    (altitude_min_m IS NULL OR altitude_min_m BETWEEN 0 AND 6000)
    AND (altitude_max_m IS NULL OR (altitude_min_m IS NOT NULL
         AND altitude_max_m BETWEEN altitude_min_m AND 6000))
  );
