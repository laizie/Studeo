-- Optional time-of-day for an assignment's due date, stored as "HH:MM" (24h).
-- NULL means all-day (just a date), which is the existing behavior for every
-- current row. The date still governs urgency/overdue; the time is used only for
-- display and for ordering items within the same day (see shared/deadlines.ts).
ALTER TABLE assignments ADD COLUMN due_time TEXT;
