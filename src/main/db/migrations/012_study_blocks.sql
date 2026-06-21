-- Planned study sessions ("back-planning"): from an exam, we suggest a handful of
-- study blocks spread across the days before it and write them onto the calendar.
-- Each block is an all-day item on a date (no specific time-of-day in v1). Deleting
-- the exam assignment removes its blocks (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS study_blocks (
  id               TEXT PRIMARY KEY,
  assignment_id    TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  course_id        TEXT REFERENCES courses(id),
  title            TEXT NOT NULL,
  scheduled_date   TEXT NOT NULL,            -- 'YYYY-MM-DD' (local)
  duration_minutes INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned', 'done', 'skipped')),
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_blocks_assignment ON study_blocks(assignment_id);
