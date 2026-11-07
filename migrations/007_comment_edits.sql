-- Moni Cafe — comment edits (issue #81)
-- edited_at is null until the author changes the text with updateComment;
-- the UI shows "edited" when it is set.

ALTER TABLE comments ADD COLUMN edited_at TIMESTAMPTZ;
