-- Repeating tasks that remember they belong together.
--
-- The same change 018 made for assignments, for the other half of the app that
-- has a "Repeat this" checkbox wired to generateRepeats. Tasks were still
-- expanding into numbered strangers, so a weekly chore that slipped meant
-- editing every remaining row by hand.
--
-- Deliberately thinner than assignment_series. A task has no course, no type
-- and no time of day, and inventing those columns here just to mirror the other
-- table would be modelling the symmetry rather than the thing. Unlike
-- assignment_series there is no course_id at all, so nothing cascades into this
-- table — tasks are free-floating by design (PRD §7).

CREATE TABLE IF NOT EXISTS task_series (
  id             TEXT PRIMARY KEY,
  name_template  TEXT NOT NULL,
  interval_weeks INTEGER NOT NULL CHECK (interval_weeks >= 1),
  anchor_date    TEXT NOT NULL,
  until_date     TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

-- ON DELETE SET NULL, as in 018: "stop repeating this" drops the rule and
-- nothing else. The stakes are lower than they are for a graded assignment, but
-- the principle is the one that keeps the feature trustworthy — turning a
-- repeat off is never allowed to delete work.
ALTER TABLE tasks ADD COLUMN series_id TEXT REFERENCES task_series(id) ON DELETE SET NULL;

-- 1-based position, not derived from due_date. See 018 for why: "this and
-- later" has to mean later in the series, because the dates are the thing the
-- user is about to move around.
ALTER TABLE tasks ADD COLUMN series_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_tasks_series ON tasks(series_id, series_index);
