-- Repeating assignments that remember they belong together.
--
-- "Repeat this assignment" already existed (shared/repeat.ts), but it only ever
-- expanded into numbered, disconnected rows: twelve homeworks that had never
-- heard of each other. So the moment a syllabus slipped, moving the series meant
-- editing twelve rows by hand. This migration gives that expansion an identity.
--
-- The rule is bookkeeping, the rows are the truth. That's the opposite of
-- class_meetings/meeting_exceptions, where the recurring row IS the schedule and
-- exceptions override it per date — and the difference is deliberate. A class
-- occurrence carries no state, so it can be computed. An assignment occurrence
-- carries status, a score, subtasks, study blocks and note links, so it has to
-- be a real row, and the whole app keeps reading ordinary rows as before.

CREATE TABLE IF NOT EXISTS assignment_series (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  -- The first occurrence's name as typed ("Homework 1"). Later ones are numbered
  -- from it by generateRepeats, so this is also what "extend the series" continues.
  name_template  TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'Assignment',
  -- 1 = weekly, 2 = every two weeks (what the dialog offers today).
  interval_weeks INTEGER NOT NULL CHECK (interval_weeks >= 1),
  anchor_date    TEXT NOT NULL,
  until_date     TEXT NOT NULL,
  due_time       TEXT,
  created_at     TEXT NOT NULL
);

-- ON DELETE SET NULL, emphatically not CASCADE: "stop repeating this" must never
-- delete your graded homework. Dropping the rule leaves every occurrence standing
-- as an ordinary one-off assignment, score and all.
ALTER TABLE assignments ADD COLUMN series_id TEXT REFERENCES assignment_series(id) ON DELETE SET NULL;

-- 1-based position in the series, NOT derived from due_date — because dates are
-- exactly what gets shifted around. "This and later" has to mean "later in the
-- series", not "later on the calendar", or dragging occurrence 5 past 6 silently
-- renumbers the rest and the next bulk move hits the wrong rows.
ALTER TABLE assignments ADD COLUMN series_index INTEGER;

-- Every series query is "this series, in order" — membership lookups for a bulk
-- shift, and the last occurrence when extending. series_id leftmost also covers
-- the lookup the ON DELETE SET NULL above has to perform on the child side.
CREATE INDEX IF NOT EXISTS idx_assignments_series ON assignments(series_id, series_index);

-- assignment_series(course_id) earns an index for the same reason the others do:
-- without it, deleting a course scans the whole table to cascade.
CREATE INDEX IF NOT EXISTS idx_assignment_series_course ON assignment_series(course_id);
