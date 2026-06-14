-- A note-level pin (distinct from the note_links pin in 007). 007 pins a note inside ONE
-- entity's view (e.g. a single course's notes list); this pin lives on the note itself, so
-- it's a global favorite that surfaces the note in a "Pinned" section across the app.
-- is_pinned is 0/1 (SQLite has no boolean type).

ALTER TABLE notes
  ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1));
