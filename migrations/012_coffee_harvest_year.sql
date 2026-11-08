-- Moni Cafe — which crop a coffee comes from (issue #129)
-- harvest_year is the year the harvest ended, as roasters print it on the bag
-- ("2025 產季"). NULL means the seller didn't say. The API also refuses future
-- years (Asia/Taipei); the CHECK is a wide sanity range so seeds and admin
-- tools can't store nonsense.

ALTER TABLE coffees
  ADD COLUMN harvest_year INTEGER;

ALTER TABLE coffees
  ADD CONSTRAINT coffees_harvest_year_range
    CHECK (harvest_year IS NULL OR harvest_year BETWEEN 2000 AND 2100);

CREATE INDEX idx_coffees_harvest_year ON coffees (harvest_year) WHERE harvest_year IS NOT NULL;
