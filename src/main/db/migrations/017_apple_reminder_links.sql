-- Maps each assignment to the reminder mirroring it in Apple Reminders, so a
-- re-sync updates that reminder instead of creating a second one.
--
-- A separate table rather than a column on `assignments` on purpose: this is an
-- optional, platform-specific integration, and keeping it out of the domain table
-- means turning it off is a DELETE of rows nobody else reads — no schema change,
-- no risk to the assignment itself.
--
-- assignment_id is the primary key because an assignment mirrors to exactly one
-- reminder.
--
-- There is deliberately NO foreign key on assignment_id, and that is the whole
-- point of this table's design — please don't "fix" it by adding one.
--
-- The obvious version (REFERENCES assignments(id) ON DELETE CASCADE) is wrong in
-- a way that only shows up on a phone. Deleting an assignment cascades this row
-- away, and this row holds the only record of the reminder's id. The sync then
-- has no idea that reminder ever existed, so it can never delete it: the item
-- stays on your phone forever, alerting you about work that no longer exists.
-- Caught by driving a real Reminders.app, not by any unit test — the planner's
-- "link with no assignment → remove the reminder" branch was correct and simply
-- never received the input.
--
-- Without the foreign key, deleting an assignment leaves this row behind, the
-- next sync sees a link whose assignment is gone, deletes the reminder, and then
-- deletes the row. Orphans are the mechanism, not a leak.
--
-- signature stores what we last pushed (title, body, due instant, flattened). If
-- it still matches what the assignment would produce now, the sync skips that
-- item — every skipped item is an AppleScript round-trip not taken.

CREATE TABLE IF NOT EXISTS apple_reminder_links (
  assignment_id TEXT PRIMARY KEY,
  reminder_id   TEXT NOT NULL,
  signature     TEXT NOT NULL,
  synced_at     TEXT NOT NULL
);
