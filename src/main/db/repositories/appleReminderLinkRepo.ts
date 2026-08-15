import { getDb } from '../connection';
import { asRow } from '../rows';
import type { ReminderLink } from '../../../shared/appleReminderSync';

// Which assignment maps to which reminder in the Apple Reminders list, and what we
// last pushed for it. Read in full on every sync (there are only ever as many rows
// as there are mirrored assignments), so there's no filtered list query here.

const row = (r: unknown): ReminderLink & { synced_at: string } =>
  asRow<ReminderLink & { synced_at: string }>(r);

export function listReminderLinks(): ReminderLink[] {
  return (getDb().prepare('SELECT * FROM apple_reminder_links').all() as unknown[])
    .map(row)
    .map(({ assignment_id, reminder_id, signature }) => ({ assignment_id, reminder_id, signature }));
}

/** Record (or refresh) the mirror for one assignment. */
export function saveReminderLink(assignmentId: string, reminderId: string, signature: string): void {
  getDb()
    .prepare(
      `INSERT INTO apple_reminder_links (assignment_id, reminder_id, signature, synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(assignment_id) DO UPDATE SET
         reminder_id = excluded.reminder_id,
         signature   = excluded.signature,
         synced_at   = excluded.synced_at`,
    )
    .run(assignmentId, reminderId, signature, new Date().toISOString());
}

/**
 * Forget the mirror for one assignment.
 *
 * Also the self-healing path: if a reminder was deleted on the phone, the next
 * update against its id fails, we drop the link here, and the sync after that
 * recreates it from scratch.
 */
export function deleteReminderLink(assignmentId: string): void {
  getDb().prepare('DELETE FROM apple_reminder_links WHERE assignment_id = ?').run(assignmentId);
}
