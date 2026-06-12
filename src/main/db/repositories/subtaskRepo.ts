import { getDb } from '../connection';
import type { Subtask, CreateSubtaskInput, UpdateSubtaskInput } from '../../../shared/types';

function row(r: unknown): Subtask {
  return r as Subtask;
}

export function listSubtasks(filters: { assignmentId?: string } = {}): Subtask[] {
  let sql = 'SELECT * FROM subtasks';
  const params: string[] = [];

  if (filters.assignmentId) {
    sql += ' WHERE assignment_id = ?';
    params.push(filters.assignmentId);
  }
  sql += ' ORDER BY sort_order ASC, created_at ASC';

  return (getDb().prepare(sql).all(...params) as unknown[]).map(row);
}

export function getSubtask(id: string): Subtask | null {
  const r = getDb().prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
  return r ? row(r) : null;
}

export function createSubtask(input: CreateSubtaskInput): Subtask {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // New steps go to the end of the list.
  getDb()
    .prepare(
      `INSERT INTO subtasks (id, assignment_id, name, completed, sort_order, created_at)
       VALUES (?, ?, ?, 0,
         (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM subtasks WHERE assignment_id = ?),
         ?)`
    )
    .run(id, input.assignmentId, input.name, input.assignmentId, now);
  return getSubtask(id)!;
}

export function updateSubtask(id: string, input: UpdateSubtaskInput): Subtask {
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (input.name !== undefined)      { fields.push('name = ?');      values.push(input.name); }
  if (input.completed !== undefined) { fields.push('completed = ?'); values.push(input.completed ? 1 : 0); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getSubtask(id)!;
}

export function deleteSubtask(id: string): void {
  getDb().prepare('DELETE FROM subtasks WHERE id = ?').run(id);
}
