import { getDb } from '../connection';
import type { StudySession, CreateStudySessionInput } from '../../../shared/types';

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
      'INSERT INTO study_sessions (id, started_at, duration_seconds, kind, course_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, input.startedAt, input.durationSeconds, input.kind, input.courseId ?? null);
  return getStudySession(id)!;
}
