import { getDb } from '../connection';
import type {
  Assignment,
  AssignmentStatus,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from '../../../shared/types';

function row(r: unknown): Assignment {
  return r as Assignment;
}

export interface AssignmentFilters {
  courseId?: string;
  status?: AssignmentStatus;
}

export function listAssignments(filters: AssignmentFilters = {}): Assignment[] {
  let sql = 'SELECT * FROM assignments';
  const params: (string | null)[] = [];
  const clauses: string[] = [];

  if (filters.courseId) { clauses.push('course_id = ?'); params.push(filters.courseId); }
  if (filters.status)   { clauses.push('status = ?');    params.push(filters.status); }

  if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ');
  // Within a day, all-day items (NULL time) come first, then timed ones in
  // chronological order — matches dueSortValue() used on the renderer side.
  sql += ' ORDER BY due_date ASC, (due_time IS NULL) DESC, due_time ASC';

  return (getDb().prepare(sql).all(...params) as unknown[]).map(row);
}

export function getAssignment(id: string): Assignment | null {
  const r = getDb().prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  return r ? row(r) : null;
}

export function createAssignment(input: CreateAssignmentInput): Assignment {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? 'not_started';
  // Rare, but an import could create an already-done item — stamp it now so it's
  // consistent with the update path (status 'completed' always implies a date).
  const completedAt = status === 'completed' ? now : null;
  getDb()
    .prepare(
      'INSERT INTO assignments (id, course_id, name, type, status, due_date, due_time, notes, score, points_possible, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      id,
      input.courseId,
      input.name,
      input.type ?? 'Assignment',
      status,
      input.dueDate,
      input.dueTime ?? null,
      input.notes ?? null,
      input.score ?? null,
      input.pointsPossible ?? null,
      completedAt,
      now,
    );
  return getAssignment(id)!;
}

/**
 * Insert a whole batch atomically (Day-One Setup / syllabus import).
 * Wrapped in a transaction so one bad row can't leave a half-saved semester:
 * either every assignment lands or none do.
 */
export function createAssignments(inputs: CreateAssignmentInput[]): Assignment[] {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const created = inputs.map(createAssignment);
    db.exec('COMMIT');
    return created;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateAssignment(id: string, input: UpdateAssignmentInput): Assignment {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined)    { fields.push('name = ?');     values.push(input.name); }
  if (input.type !== undefined)    { fields.push('type = ?');     values.push(input.type); }
  if (input.status !== undefined) {
    fields.push('status = ?'); values.push(input.status);
    // Stamp completed_at on the transition INTO 'completed', clear it on the way
    // OUT. Only touch it on an actual transition so re-saving a done item doesn't
    // move its completion date. Needs the prior status, hence the read.
    const wasCompleted = getAssignment(id)?.status === 'completed';
    const nowCompleted = input.status === 'completed';
    if (nowCompleted && !wasCompleted)      { fields.push('completed_at = ?'); values.push(new Date().toISOString()); }
    else if (!nowCompleted && wasCompleted) { fields.push('completed_at = ?'); values.push(null); }
  }
  if (input.dueDate !== undefined) { fields.push('due_date = ?'); values.push(input.dueDate); }
  if (input.dueTime !== undefined) { fields.push('due_time = ?'); values.push(input.dueTime ?? null); }
  if (input.notes !== undefined)   { fields.push('notes = ?');    values.push(input.notes ?? null); }
  if (input.score !== undefined)          { fields.push('score = ?');           values.push(input.score ?? null); }
  if (input.pointsPossible !== undefined) { fields.push('points_possible = ?'); values.push(input.pointsPossible ?? null); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE assignments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getAssignment(id)!;
}

export function deleteAssignment(id: string): void {
  getDb().prepare('DELETE FROM assignments WHERE id = ?').run(id);
}
