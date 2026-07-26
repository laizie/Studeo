-- Indexes for the columns every list query filters or sorts by.
--
-- The original tables (001) shipped with none beyond their primary keys; the later
-- feature migrations added indexes for their own tables (subtasks, notes, note_links,
-- note_versions, study_blocks) but nothing ever went back for the core four.
--
-- At a student's data volumes SQLite scans these in microseconds, so this is not a
-- fix for a measured slowdown — it's two other things:
--   1. An unindexed column on the child side of a foreign key makes every cascade
--      delete a full table scan of the child (deleting a course scans all assignments,
--      all class meetings, and so on). That cost grows with history, not with the
--      current semester.
--   2. Both list queries here are also ORDER BY on these columns, so the index removes
--      a sort as well as a scan.
--
-- IF NOT EXISTS throughout, so re-running this file is harmless.

-- assignments: filtered by course on every Course Detail load and in deleteCourse's
-- snapshot; ordered by due_date on every list.
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due    ON assignments(due_date);

-- class_meetings: filtered by course; the tray and reminder scheduler read these
-- every 30 seconds.
CREATE INDEX IF NOT EXISTS idx_class_meetings_course ON class_meetings(course_id);

-- tasks: the only ordering the list uses.
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- study_sessions: ordered by started_at on every read; course_id is scanned by
-- deleteCourse (to null the link) and by restoreCourse.
CREATE INDEX IF NOT EXISTS idx_study_sessions_started ON study_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_study_sessions_course  ON study_sessions(course_id);

-- study_blocks already indexes assignment_id (012); course_id is the other half of
-- deleteCourse's lookup.
CREATE INDEX IF NOT EXISTS idx_study_blocks_course ON study_blocks(course_id);

-- Deliberately NOT indexed: meeting_exceptions(meeting_id) — the UNIQUE (meeting_id,
-- date) constraint from 002 already creates an index with meeting_id leftmost, so a
-- second one would be dead weight the writer still has to maintain.
