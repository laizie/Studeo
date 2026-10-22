import { getDb } from '../connection';
import { asRow } from '../rows';
import { shiftDate, shiftSkipReason } from '../../../shared/repeat';
import type {
  Task,
  CreateTaskInput,
  DateChange,
  DateSet,
  SeriesScope,
  ShiftResult,
  ShiftTasksInput,
  UpdateTaskInput,
} from '../../../shared/types';

const row = (r: unknown): Task => asRow<Task>(r);

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
    .prepare(
      'INSERT INTO tasks (id, name, status, due_date, completed_at, series_id, series_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      id,
      input.name,
      status,
      input.dueDate,
      completedAt,
      input.seriesId ?? null,
      input.seriesIndex ?? null,
      now,
    );
  return getTask(id)!;
}

/**
 * Insert a whole batch atomically. Wrapped in a transaction so one bad row can't
 * leave half a batch behind: either every task lands or none do.
 *
 * Recurring tasks no longer come through here — they go via createTaskSeries, so
 * the rows it writes know they belong together. This stays as the plain batch
 * primitive, mirroring createAssignments(), which the ICS importer still uses.
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

// ─── Moving dates in bulk ─────────────────────────────────────────────────────
// Mirrors the same three functions in assignmentRepo. The SQL stays written out
// per table rather than generalized over a table name, which is the pattern the
// rest of this directory follows — the shared part is the logic in
// shared/repeat.ts, which both sides call.

/** Every occurrence of a series, in series order (not date order). */
export function listBySeries(seriesId: string): Task[] {
  return (
    getDb()
      .prepare('SELECT * FROM tasks WHERE series_id = ? ORDER BY series_index ASC')
      .all(seriesId) as unknown[]
  ).map(row);
}

/** Write new due dates for several tasks in one transaction — all or none. */
export function setDates(items: DateSet[]): number {
  if (items.length === 0) return 0;

  const db = getDb();
  db.exec('BEGIN');
  try {
    const stmt = db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?');
    for (const item of items) stmt.run(item.dueDate, item.id);
    db.exec('COMMIT');
    return items.length;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Which rows a scope reaches. A task with no series only ever means itself. */
function scopeTargets(anchor: Task, scope: SeriesScope): Task[] {
  if (scope === 'one' || !anchor.series_id || anchor.series_index == null) return [anchor];

  const db = getDb();
  const rows =
    scope === 'all'
      ? db.prepare('SELECT * FROM tasks WHERE series_id = ? ORDER BY series_index ASC').all(anchor.series_id)
      : db
          .prepare('SELECT * FROM tasks WHERE series_id = ? AND series_index >= ? ORDER BY series_index ASC')
          .all(anchor.series_id, anchor.series_index);

  return (rows as unknown[]).map(row);
}

/**
 * Move a task — and optionally the rest of its series — by a number of days.
 *
 * Same rule as assignments: the anchor always moves, because the user pointed at
 * it; finished occurrences swept up by a wider scope are left alone and reported
 * back. For a task that only ever means "already done", since there is no grade
 * to protect.
 */
export function shiftTasks(input: ShiftTasksInput): ShiftResult {
  const anchor = getTask(input.taskId);
  if (!anchor) throw new Error('Task not found');

  const changed: DateChange[] = [];
  const skipped: ShiftResult['skipped'] = [];

  for (const occurrence of scopeTargets(anchor, input.scope)) {
    const isAnchor = occurrence.id === anchor.id;
    const reason = isAnchor ? null : shiftSkipReason(occurrence);
    if (reason) {
      skipped.push({ id: occurrence.id, name: occurrence.name, reason });
      continue;
    }

    const to = shiftDate(occurrence.due_date, input.days);
    if (!to || to === occurrence.due_date) continue;
    changed.push({ id: occurrence.id, from: occurrence.due_date, to });
  }

  setDates(changed.map(c => ({ id: c.id, dueDate: c.to })));
  return { changed, skipped };
}
