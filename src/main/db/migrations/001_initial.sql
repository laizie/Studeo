-- Initial schema for ClassTrack.
-- All IDs are UUIDs (stored as TEXT). Times are ISO 8601 UTC strings.
-- ON DELETE CASCADE means deleting a course automatically deletes its
-- assignments and class meetings — no orphaned rows.

CREATE TABLE IF NOT EXISTS terms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  start_date TEXT,
  end_date   TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  color        TEXT NOT NULL,
  building     TEXT,
  term_id      TEXT REFERENCES terms(id),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS class_meetings (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  location    TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
  id        TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL DEFAULT 'Assignment',
  status    TEXT NOT NULL DEFAULT 'not_started',
  due_date  TEXT NOT NULL,
  notes     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'not_started',
  due_date   TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id               TEXT PRIMARY KEY,
  started_at       TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('focus', 'short_break', 'long_break')),
  course_id        TEXT REFERENCES courses(id)
);
