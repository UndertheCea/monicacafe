-- Moni Cafe — roast level optional, plus an extra-light roast (owner's answer
-- on #176, issue #190). NULL = the seller didn't say. EXTRA_LIGHT (極淺焙) sits
-- before LIGHT so the enum keeps its light-to-dark order.

ALTER TYPE roast_level ADD VALUE IF NOT EXISTS 'EXTRA_LIGHT' BEFORE 'LIGHT';

ALTER TABLE coffees ALTER COLUMN roast_level DROP NOT NULL;
