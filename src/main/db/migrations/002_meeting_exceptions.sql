-- One-off changes to a recurring class meeting: a cancelled occurrence
-- ("no class on Nov 26 — holiday") or a moved one (different time/room that
-- single day). The recurring class_meetings row stays untouched; calendar and
-- reminders consult this table per date.
--
-- UNIQUE (meeting_id, date): one occurrence can only have one override, so the
-- repo upserts instead of stacking conflicting exceptions.

CREATE TABLE IF NOT EXISTS meeting_exceptions (
  id             TEXT PRIMARY KEY,
  meeting_id     TEXT NOT NULL REFERENCES class_meetings(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('cancelled', 'moved')),
  new_start_time TEXT,
  new_end_time   TEXT,
  new_location   TEXT,
  UNIQUE (meeting_id, date)
);
