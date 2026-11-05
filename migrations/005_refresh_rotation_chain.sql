-- Moni Cafe — refresh-token rotation chain (issue #24)
-- Each rotated refresh token points at the token that replaced it. A token
-- revoked by logout or reuse detection has no successor. The chain lets a
-- token presented again a few seconds after its rotation (the browser aborted
-- the refresh response, e.g. on fast navigation) rotate once more instead of
-- being treated as theft; see auth.RefreshReuseGrace.

ALTER TABLE refresh_tokens
  ADD COLUMN replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL;
