-- Notes: a block-based document (Notion-like editor, stored as BlockNote JSON).
-- content_json holds the editor's block array verbatim. content_text is a derived
-- plaintext flattening of that JSON (computed in the repo on every write) — it exists
-- only to feed search + future AI, and is never authored by hand.
-- parent_note_id gives sub-pages (a note nested under another). archived_at is a soft
-- delete (trash) so archiving never loses data.

CREATE TABLE IF NOT EXISTS notes (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL DEFAULT 'Untitled',
  content_json   TEXT NOT NULL DEFAULT '[]',
  content_text   TEXT NOT NULL DEFAULT '',
  icon           TEXT,
  parent_note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  archived_at    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_parent  ON notes(parent_note_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);

-- Full-text search over title + content_text. This is an *external-content* FTS5 table:
-- it stores no copy of the data itself, just the search index, and points back at `notes`
-- via rowid (content='notes'). The three triggers below keep the index in lock-step with
-- the table, so the repo never has to touch notes_fts directly — a plain INSERT/UPDATE/
-- DELETE on notes is mirrored automatically.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  content_text,
  content='notes',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content_text)
    VALUES (new.rowid, new.title, new.content_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
    VALUES ('delete', old.rowid, old.title, old.content_text);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
    VALUES ('delete', old.rowid, old.title, old.content_text);
  INSERT INTO notes_fts(rowid, title, content_text)
    VALUES (new.rowid, new.title, new.content_text);
END;
