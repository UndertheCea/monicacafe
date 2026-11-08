-- Moni Cafe — what a coffee is roasted for (issue #122)
-- FILTER (手沖), ESPRESSO (義式) or OMNI (both). NULL means the seller didn't
-- say. Roast level is a separate thing: a light roast can be an espresso roast.
-- The CHECK repeats the GraphQL enum so seeds and admin tools can't store
-- anything else.

ALTER TABLE coffees
  ADD COLUMN brew_method TEXT;

ALTER TABLE coffees
  ADD CONSTRAINT coffees_brew_method_valid
    CHECK (brew_method IS NULL OR brew_method IN ('FILTER', 'ESPRESSO', 'OMNI'));

CREATE INDEX idx_coffees_brew_method ON coffees (brew_method) WHERE brew_method IS NOT NULL;
