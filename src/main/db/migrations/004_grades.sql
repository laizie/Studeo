-- Grades: record what you earned on finished work, and how much each
-- assignment type counts toward the course grade.
--
-- score / points_possible live on the assignment ("18 out of 20"); both NULL
-- until the user enters a grade. The current course standing is COMPUTED from
-- these (shared/grades.ts) — never stored, per the derived-values rule.
--
-- grade_weights on courses is a small JSON object: {"Homework": 30, "Exam": 40}.
-- It's one config blob edited as a unit, so a JSON column beats a join table.

ALTER TABLE assignments ADD COLUMN score REAL;
ALTER TABLE assignments ADD COLUMN points_possible REAL;
ALTER TABLE courses ADD COLUMN grade_weights TEXT;
