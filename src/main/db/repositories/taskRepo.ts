import { getDb } from '../connection';
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
} from '../../../shared/types';

function row(r: unknown): Task {
  return r as Task;
}

export function listTasks(): Task[] {
  return (getDb().prepare('SELECT * FROM tasks ORDER BY due_date ASC').all() as unknown[]).map(row);
}

export function getTask(id: string): Task | null {
  const r = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return r ? row(r) : null;
}

export function createTask(input: CreateTaskInput): Task {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? 'not_started';
  const completedAt = status === 'completed' ? now : null;
  getDb()
    .prepare('INSERT INTO tasks (id, name, status, due_date, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, input.name, status, input.dueDate, completedAt, now);
  return getTask(id)!;
}

/**
 * Insert a whole batch atomically (a recurring task series).
 * Wrapped in a transaction so one bad row can't leave a half-saved series:
 * either every task lands or none do. Mirrors createAssignments().
 */
export function createTasks(inputs: CreateTaskInput[]): Task[] {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const created = inputs.map(createTask);
    db.exec('COMMIT');
    return created;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateTask(id: string, input: UpdateTaskInput): Task {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (input.name !== undefined)    { fields.push('name = ?');     values.push(input.name); }
  if (input.status !== undefined) {
    fields.push('status = ?'); values.push(input.status);
    // Mirror assignmentRepo: stamp completed_at into 'completed', clear it out.
    const wasCompleted = getTask(id)?.status === 'completed';
    const nowCompleted = input.status === 'completed';
    if (nowCompleted && !wasCompleted)      { fields.push('completed_at = ?'); values.push(new Date().toISOString()); }
    else if (!nowCompleted && wasCompleted) { fields.push('completed_at = ?'); values.push(null); }
  }
  if (input.dueDate !== undefined) { fields.push('due_date = ?'); values.push(input.dueDate); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getTask(id)!;
}

export function deleteTask(id: string): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
}
