-- Moni Cafe — moderation, part 2 (#225): visitors report comments, shops and
-- coffees; admins work through the open reports on /admin.
--
-- target_id is not a foreign key (it points at one of three tables, and the
-- report should outlive a deleted comment so the admin sees what happened).
-- reporter_id / handled_by go NULL when that account is deleted, so deleting
-- an account never fails on a report and the report itself is kept.

CREATE TABLE reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  target_type TEXT        NOT NULL CHECK (target_type IN ('COMMENT', 'SHOP', 'COFFEE')),
  target_id   UUID        NOT NULL,
  reason      TEXT        NOT NULL CHECK (reason IN ('SPAM', 'CONTACT_INFO', 'OFFENSIVE', 'MISLEADING', 'OTHER')),
  note        TEXT        NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status      TEXT        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACTIONED', 'DISMISSED')),
  handled_by  UUID        REFERENCES users (id) ON DELETE SET NULL,
  handled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- handled_at is set exactly when the report is closed.
  CONSTRAINT reports_handled_when_closed CHECK ((status = 'OPEN') = (handled_at IS NULL))
);

-- One open report per reporter per target: reporting twice is a no-op.
CREATE UNIQUE INDEX reports_one_open_per_reporter ON reports (reporter_id, target_type, target_id)
  WHERE status = 'OPEN';
-- The admin queue (by status, newest first) and "close every open report on
-- this target".
CREATE INDEX idx_reports_status_created ON reports (status, created_at DESC, id);
CREATE INDEX idx_reports_target ON reports (target_type, target_id) WHERE status = 'OPEN';
