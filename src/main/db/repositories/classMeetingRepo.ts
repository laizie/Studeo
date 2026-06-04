import { getDb } from '../connection';
import type {
  ClassMeeting,
  CreateClassMeetingInput,
  UpdateClassMeetingInput,
} from '../../../shared/types';

function row(r: unknown): ClassMeeting {
  return r as ClassMeeting;
}

export function listClassMeetings(filters?: { courseId?: string }): ClassMeeting[] {
  if (filters?.courseId) {
    return (
      getDb()
        .prepare('SELECT * FROM class_meetings WHERE course_id = ? ORDER BY day_of_week, start_time')
        .all(filters.courseId) as unknown[]
    ).map(row);
  }
  return (
    getDb()
      .prepare('SELECT * FROM class_meetings ORDER BY course_id, day_of_week, start_time')
      .all() as unknown[]
  ).map(row);
}

export function createClassMeeting(input: CreateClassMeetingInput): ClassMeeting {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      'INSERT INTO class_meetings (id, course_id, day_of_week, start_time, end_time, location) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, input.courseId, input.dayOfWeek, input.startTime, input.endTime, input.location ?? null);
  return row(getDb().prepare('SELECT * FROM class_meetings WHERE id = ?').get(id));
}

export function updateClassMeeting(id: string, input: UpdateClassMeetingInput): ClassMeeting {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.dayOfWeek !== undefined) { fields.push('day_of_week = ?'); values.push(input.dayOfWeek); }
  if (input.startTime !== undefined) { fields.push('start_time = ?'); values.push(input.startTime); }
  if (input.endTime !== undefined)   { fields.push('end_time = ?');   values.push(input.endTime); }
  if ('location' in input)           { fields.push('location = ?');   values.push(input.location ?? null); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE class_meetings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return row(getDb().prepare('SELECT * FROM class_meetings WHERE id = ?').get(id));
}

export function deleteClassMeeting(id: string): void {
  getDb().prepare('DELETE FROM class_meetings WHERE id = ?').run(id);
}
