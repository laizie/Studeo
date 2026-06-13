-- Point-in-time snapshots of a note's document, so an accidental change can be undone
-- ("restore yesterday's notes"). Snapshots are throttled (see noteVersionRepo) so autosave
-- doesn't create a row per keystroke, and pruned to a recent few per note. This is a simple
-- local-first history — NOT collaborative/operational-transform versioning (that's a future
-- concern, see the architecture plan §4.5).

CREATE TABLE IF NOT EXISTS note_versions (
  id           TEXT PRIMARY KEY,
  note_id      TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  content_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, created_at);
