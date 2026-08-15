-- Maps each assignment to the reminder mirroring it in Apple Reminders, so a
-- re-sync updates that reminder instead of creating a second one.
--
-- A separate table rather than a column on `assignments` on purpose: this is an
-- optional, platform-specific integration, and keeping it out of the domain table
-- means turning it off is a DELETE of rows nobody else reads — no schema change,
-- no risk to the assignment itself.
--
-- assignment_id is the primary key because an assignment mirrors to exactly one
-- reminder. ON DELETE CASCADE clears the row when the assignment goes; the sync
-- notices the reminder is orphaned on its next pass and removes it from the list.
--
-- signature stores what we last pushed (title, body, due instant, flattened). If
-- it still matches what the assignment would produce now, the sync skips that
-- item — every skipped item is an AppleScript round-trip not taken.

CREATE TABLE IF NOT EXISTS apple_reminder_links (
  assignment_id TEXT PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
  reminder_id   TEXT NOT NULL,
  signature     TEXT NOT NULL,
  synced_at     TEXT NOT NULL
);
