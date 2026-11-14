-- Moni Cafe — admin takedowns stick (#282).
--
-- removed_at / removed_by: an admin took the coffee down (adminUnpublishCoffee,
-- or a report resolved with REMOVE). Until an admin restores it
-- (adminRestoreCoffee) the seller can't publish it again, duplicate it or
-- delete it, so the listing can't come back and the evidence (comments, saves,
-- reports) can't be erased. NULL = not taken down.

ALTER TABLE coffees
  ADD COLUMN removed_at TIMESTAMPTZ,
  ADD COLUMN removed_by UUID REFERENCES users (id) ON DELETE SET NULL;

-- Coffees an admin unpublished before this migration that are still drafts
-- count as taken down (the latest UNPUBLISH_COFFEE entry decides who / when).
UPDATE coffees c SET removed_at = a.created_at, removed_by = a.actor_id
FROM (
  SELECT DISTINCT ON (target_id) target_id, actor_id, created_at
  FROM audit_log WHERE action = 'UNPUBLISH_COFFEE' AND target_type = 'COFFEE'
  ORDER BY target_id, created_at DESC
) a
WHERE c.id = a.target_id AND NOT c.is_published;
