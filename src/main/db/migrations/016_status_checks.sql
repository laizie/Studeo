-- Put a CHECK constraint behind the status enum on assignments and tasks.
--
-- Until now nothing at ANY layer stopped a bad status reaching these columns: the IPC
-- handlers validated grades and due times but wrote status straight through, and the
-- columns carried no constraint. The handlers now validate (see shared/validate.ts);
-- this is the second layer, for the paths that don't go through a handler — a repo
-- called directly, a future migration, or a hand-edited database.
--
-- Why `status` and NOT `type`:
--   CLAUDE.md makes the assignment TYPE list explicitly extensible — "a fixed enum
--   defined once in shared/types.ts. Add or change types only there." A CHECK constraint
--   would quietly make that untrue: adding 'Presentation' would then need a second edit
--   here plus a table-rebuild migration, and forgetting it would fail at runtime rather
--   than at compile time. The status enum has the opposite character — three values,
--   settled since 001, and the PRD (§11) commits to keeping them for legacy rows. A
--   constraint fits a settled enum and fights an open one.
--
-- SQLite has no ALTER TABLE ADD CONSTRAINT, so this is the documented twelve-step
-- rebuild. The runner disables foreign keys around it (see Migration.foreignKeysOff)
-- because DROP TABLE with enforcement ON does an implicit DELETE that would cascade
-- into subtasks and study_blocks — and it runs PRAGMA foreign_key_check before the
-- COMMIT to prove nothing was orphaned.

-- ── assignments ───────────────────────────────────────────────────────────────
CREATE TABLE assignments_new (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'Assignment',
  status          TEXT NOT NULL DEFAULT 'not_started'
                    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  due_date        TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  score           REAL,
  points_possible REAL,
  due_time        TEXT,
  completed_at    TEXT
);

-- Column list written out rather than SELECT *, so this copy is insensitive to the
-- column ORDER the original table happens to have after eight ALTER TABLEs.
INSERT INTO assignments_new
  (id, course_id, name, type, status, due_date, notes, created_at,
   score, points_possible, due_time, completed_at)
SELECT
   id, course_id, name, type, status, due_date, notes, created_at,
   score, points_possible, due_time, completed_at
FROM assignments;

DROP TABLE assignments;
ALTER TABLE assignments_new RENAME TO assignments;

-- Dropping the table dropped its indexes with it; 015's two have to come back.
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due    ON assignments(due_date);

-- ── tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE tasks_new (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'not_started'
                 CHECK (status IN ('not_started', 'in_progress', 'completed')),
  due_date     TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  completed_at TEXT
);

INSERT INTO tasks_new (id, name, status, due_date, created_at, completed_at)
SELECT                 id, name, status, due_date, created_at, completed_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
