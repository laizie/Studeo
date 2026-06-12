-- Checklist steps inside an assignment ("Essay" → outline, draft, revise).
-- completed is INTEGER 0/1 — SQLite has no boolean type.
-- sort_order keeps the user's entry order stable across reloads.

CREATE TABLE IF NOT EXISTS subtasks (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  completed     INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtasks_assignment ON subtasks(assignment_id);
