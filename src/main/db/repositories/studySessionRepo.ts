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

/**
 * Remove a logged session, returning the row so Undo can put it back verbatim.
 *
 * Until now a session could be created and annotated but never removed, so anything
 * mis-logged — a timer left running, a duplicate from a crash-recovery replay — was
 * permanent, and silently skewed the heatmap, the Dashboard's "focused this week" and
 * the Weekly Review. For a personal-history feature, "you can never take an entry out"
 * is a hard edge.
 *
 * Notes linked to the session are deliberately NOT deleted here — the handler clears
 * them, mirroring how the other per-row deletes are arranged.
 */
export function deleteStudySession(id: string): StudySession | null {
  const existing = getStudySession(id);
  if (!existing) return null;
  getDb().prepare('DELETE FROM study_sessions WHERE id = ?').run(id);
  return existing;
}

/** Put a deleted session back with the same id, so its note links resolve again. */
export function restoreStudySession(s: StudySession): StudySession {
  getDb()
    .prepare(
      `INSERT INTO study_sessions (id, started_at, duration_seconds, kind, course_id, intention, reflection)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(s.id, s.started_at, s.duration_seconds, s.kind, s.course_id, s.intention, s.reflection);
  return getStudySession(s.id)!;
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
