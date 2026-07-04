-- When an assignment or task was marked done, as an ISO 8601 UTC timestamp.
-- NULL means "not completed" (or completed before this column existed — we can't
-- know the date retroactively, so those stay NULL and simply won't appear in the
-- Weekly Review's "what got done this week"). The repositories set this whenever
-- status transitions INTO 'completed' and clear it when status moves back out.
-- status is still the source of truth for "is it done"; completed_at only records
-- WHEN, for time-windowed views like the weekly review and future streaks.
ALTER TABLE assignments ADD COLUMN completed_at TEXT;
ALTER TABLE tasks       ADD COLUMN completed_at TEXT;
