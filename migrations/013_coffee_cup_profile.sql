-- Moni Cafe — how a coffee tastes on the three scales roasters print (issue #136)
-- 酸度 / 甜度 / 醇厚度 (acidity / sweetness / body), each 1 (low) to 5 (high).
-- NULL means the seller didn't say. The API sets the three as one group.

ALTER TABLE coffees
  ADD COLUMN acidity   SMALLINT,
  ADD COLUMN sweetness SMALLINT,
  ADD COLUMN body      SMALLINT;

ALTER TABLE coffees
  ADD CONSTRAINT coffees_acidity_range   CHECK (acidity   IS NULL OR acidity   BETWEEN 1 AND 5),
  ADD CONSTRAINT coffees_sweetness_range CHECK (sweetness IS NULL OR sweetness BETWEEN 1 AND 5),
  ADD CONSTRAINT coffees_body_range      CHECK (body      IS NULL OR body      BETWEEN 1 AND 5);

-- "Low acidity" is the common filter (CoffeeFilter.maxAcidity).
CREATE INDEX idx_coffees_acidity ON coffees (acidity) WHERE acidity IS NOT NULL;
