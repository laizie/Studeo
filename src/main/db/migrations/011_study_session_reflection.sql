-- A focus session can carry a one-line intention (set before you start) and a
-- one-line reflection (jotted right after it ends) — the bookends of Focus Mode.
-- Both are optional; existing rows simply have NULL for each.
ALTER TABLE study_sessions ADD COLUMN intention TEXT;
ALTER TABLE study_sessions ADD COLUMN reflection TEXT;
