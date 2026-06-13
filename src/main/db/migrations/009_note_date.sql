-- An optional date for a note, used to place it on a class's Timeline (which week it belongs
-- to). Lecture notes set this to their session date; readings/other dated notes can set it
-- too. A note with no note_date lives in the freeform "Pages" tree instead of the Timeline.

ALTER TABLE notes ADD COLUMN note_date TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_note_date ON notes(note_date);
