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
  sql += ' ORDER BY due_date ASC';

  return (getDb().prepare(sql).all(...params) as unknown[]).map(row);
}

export function getAssignment(id: string): Assignment | null {
  const r = getDb().prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  return r ? row(r) : null;
}

export function createAssignment(input: CreateAssignmentInput): Assignment {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      'INSERT INTO assignments (id, course_id, name, type, status, due_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      id,
      input.courseId,
      input.name,
      input.type ?? 'Assignment',
      input.status ?? 'not_started',
      input.dueDate,
      input.notes ?? null,
      now,
    );
  return getAssignment(id)!;
}

export function updateAssignment(id: string, input: UpdateAssignmentInput): Assignment {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (input.name !== undefined)    { fields.push('name = ?');     values.push(input.name); }
  if (input.type !== undefined)    { fields.push('type = ?');     values.push(input.type); }
  if (input.status !== undefined)  { fields.push('status = ?');   values.push(input.status); }
  if (input.dueDate !== undefined) { fields.push('due_date = ?'); values.push(input.dueDate); }
  if (input.notes !== undefined)   { fields.push('notes = ?');    values.push(input.notes ?? null); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE assignments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getAssignment(id)!;
}

export function deleteAssignment(id: string): void {
  getDb().prepare('DELETE FROM assignments WHERE id = ?').run(id);
}
