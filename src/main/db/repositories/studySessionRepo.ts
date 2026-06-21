import { getDb } from '../connection';
import type {
  StudySession,
  CreateStudySessionInput,
  UpdateStudySessionInput,
} from '../../../shared/types';

function row(r: unknown): StudySession {
  return r as StudySession;
}

export function listStudySessions(): StudySession[] {
  return (
    getDb().prepare('SELECT * FROM study_sessions ORDER BY started_at DESC').all() as unknown[]
  ).map(row);
}

export function getStudySession(id: string): StudySession | null {
  const r = getDb().prepare('SELECT * FROM study_sessions WHERE id = ?').get(id);
  return r ? row(r) : null;
}

export function createStudySession(input: CreateStudySessionInput): StudySession {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      'INSERT INTO study_sessions (id, started_at, duration_seconds, kind, course_id, intention) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      id,
      input.startedAt,
      input.durationSeconds,
      input.kind,
      input.courseId ?? null,
      input.intention?.trim() || null,
    );
  return getStudySession(id)!;
}

// Attach an intention/reflection to a session after the fact (Focus Mode logs the
// session on completion, then the user adds a reflection a moment later).
export function updateStudySession(id: string, input: UpdateStudySessionInput): StudySession {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (input.intention !== undefined)  { fields.push('intention = ?');  values.push(input.intention?.trim() || null); }
  if (input.reflection !== undefined) { fields.push('reflection = ?'); values.push(input.reflection?.trim() || null); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE study_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getStudySession(id)!;
}
