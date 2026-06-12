import { getDb } from '../connection';
import type { MeetingException, CreateMeetingExceptionInput } from '../../../shared/types';

function row(r: unknown): MeetingException {
  return r as MeetingException;
}

export function listMeetingExceptions(filters: { meetingId?: string } = {}): MeetingException[] {
  let sql = 'SELECT * FROM meeting_exceptions';
  const params: string[] = [];

  if (filters.meetingId) {
    sql += ' WHERE meeting_id = ?';
    params.push(filters.meetingId);
  }
  sql += ' ORDER BY date ASC';

  return (getDb().prepare(sql).all(...params) as unknown[]).map(row);
}

export function getMeetingException(id: string): MeetingException | null {
  const r = getDb().prepare('SELECT * FROM meeting_exceptions WHERE id = ?').get(id);
  return r ? row(r) : null;
}

/**
 * Upsert: an occurrence (meeting + date) can only have one override, so
 * creating a second exception for the same date replaces the first instead
 * of failing on the UNIQUE constraint.
 */
export function createMeetingException(input: CreateMeetingExceptionInput): MeetingException {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO meeting_exceptions
         (id, meeting_id, date, kind, new_start_time, new_end_time, new_location)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (meeting_id, date) DO UPDATE SET
         kind           = excluded.kind,
         new_start_time = excluded.new_start_time,
         new_end_time   = excluded.new_end_time,
         new_location   = excluded.new_location`
    )
    .run(
      id,
      input.meetingId,
      input.date,
      input.kind,
      input.kind === 'moved' ? input.newStartTime ?? null : null,
      input.kind === 'moved' ? input.newEndTime ?? null : null,
      input.kind === 'moved' ? input.newLocation ?? null : null,
    );

  // On conflict the original row (and its id) survives — look up by the
  // natural key rather than assuming our new id was inserted.
  const r = getDb()
    .prepare('SELECT * FROM meeting_exceptions WHERE meeting_id = ? AND date = ?')
    .get(input.meetingId, input.date);
  return row(r);
}

export function deleteMeetingException(id: string): void {
  getDb().prepare('DELETE FROM meeting_exceptions WHERE id = ?').run(id);
}
