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
  getDb()
    .prepare('INSERT INTO tasks (id, name, status, due_date, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, input.name, input.status ?? 'not_started', input.dueDate, now);
  return getTask(id)!;
}

export function updateTask(id: string, input: UpdateTaskInput): Task {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (input.name !== undefined)    { fields.push('name = ?');     values.push(input.name); }
  if (input.status !== undefined)  { fields.push('status = ?');   values.push(input.status); }
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
