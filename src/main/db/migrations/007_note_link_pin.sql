-- Pinning a note on an entity surfaces it at the top of that entity's notes list — e.g. a
-- course's "home"/overview page. The pin lives on the LINK, not the note, so the same note
-- can be pinned on one course and unpinned on another. is_pinned is 0/1 (SQLite has no bool).

ALTER TABLE note_links
  ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1));
