import { getDb } from '../connection';
import { asRow } from '../rows';
import { generateRepeats } from '../../../shared/repeat';
import { createTask, getTask, listBySeries, writeTask } from './taskRepo';
import type {
  Task,
  TaskSeries,
  TaskSeriesWithOccurrences,
  CreateTaskSeriesInput,
  ExtendTaskSeriesInput,
  RestoreTaskOccurrencesInput,
  StopRepeatingTasksInput,
  StopRepeatingTasksResult,
  TaskKeptReason,
} from '../../../shared/types';

const row = (r: unknown): TaskSeries => asRow<TaskSeries>(r);

export function listTaskSeries(): TaskSeries[] {
  return (
    getDb().prepare('SELECT * FROM task_series ORDER BY anchor_date ASC').all() as unknown[]
  ).map(row);
}

export function getTaskSeries(id: string): TaskSeries | null {
  const r = getDb().prepare('SELECT * FROM task_series WHERE id = ?').get(id);
  return r ? row(r) : null;
}

/** The series row plus its occurrences, with no transaction of its own. */
function insertSeries(
  rule: { nameTemplate: string; intervalWeeks: number; anchorDate: string; untilDate: string },
  occurrences: { name: string; dueDate: string }[],
): TaskSeriesWithOccurrences {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO task_series
         (id, name_template, interval_weeks, anchor_date, until_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      rule.nameTemplate,
      rule.intervalWeeks,
      rule.anchorDate,
      rule.untilDate,
      new Date().toISOString(),
    );

  const tasks = occurrences.map((occurrence, i) =>
    createTask({
      name: occurrence.name,
      dueDate: occurrence.dueDate,
      seriesId: id,
      // 1-based, so it reads like "occurrence 3 of 12".
      seriesIndex: i + 1,
    }),
  );

  return { series: getTaskSeries(id)!, tasks };
}

/**
 * Create a repeating task: the rule, plus every occurrence it expands to, in one
 * transaction. Either the whole series lands or none of it does.
 *
 * The expansion is still generateRepeats, shared with assignments and already
 * tested — all that is new here is stamping each row with the series id and its
 * position, so a later "move this and the rest" knows what the rest is.
 */
export function createTaskSeries(input: CreateTaskSeriesInput): TaskSeriesWithOccurrences {
  const db = getDb();
  const occurrences = [
    { name: input.name, dueDate: input.anchorDate },
    ...generateRepeats(input.name, input.anchorDate, input.untilDate, input.intervalWeeks),
  ];

  db.exec('BEGIN');
  try {
    const result = insertSeries(
      {
        nameTemplate: input.name,
        intervalWeeks: input.intervalWeeks,
        anchorDate: input.anchorDate,
        untilDate: input.untilDate,
      },
      occurrences,
    );
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Push a series' end date out and append the occurrences that now fit.
 *
 * Continues from the LAST existing occurrence rather than recomputing from the
 * anchor, so an occurrence moved by hand isn't duplicated and the numbering
 * picks up where the real rows left off.
 */
export function extendTaskSeries(input: ExtendTaskSeriesInput): TaskSeriesWithOccurrences {
  const db = getDb();
  const series = getTaskSeries(input.seriesId);
  if (!series) throw new Error('Series not found');

  const existing = listBySeries(series.id);
  const last = existing[existing.length - 1];
  // Every occurrence deleted by hand? Fall back to the rule's own anchor.
  const fromName = last?.name ?? series.name_template;
  const fromDate = last?.due_date ?? series.anchor_date;
  const nextIndex = (last?.series_index ?? 0) + 1;

  const followUps = generateRepeats(fromName, fromDate, input.untilDate, series.interval_weeks);

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE task_series SET until_date = ? WHERE id = ?').run(input.untilDate, series.id);

    const tasks: Task[] = followUps.map((occurrence, i) =>
      createTask({
        name: occurrence.name,
        dueDate: occurrence.dueDate,
        seriesId: series.id,
        seriesIndex: nextIndex + i,
      }),
    );

    db.exec('COMMIT');
    return { series: getTaskSeries(series.id)!, tasks };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * "Stop repeating this" — drops the rule and nothing else. Every occurrence
 * survives as an ordinary one-off task. Both columns are cleared explicitly
 * rather than left to the FK's ON DELETE SET NULL, so no row keeps a position in
 * a series that no longer exists.
 */
export function deleteTaskSeries(id: string): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE tasks SET series_id = NULL, series_index = NULL WHERE series_id = ?').run(id);
    db.prepare('DELETE FROM task_series WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ─── Cutting a series short ───────────────────────────────────────────────────

/**
 * Why this occurrence isn't a placeholder, or null if it is.
 *
 * Shorter than the assignment version because there is less to ask. A task has
 * no grade, and nothing in the schema references tasks(id) — no steps, no
 * planned study blocks, no linked notes — so its own status is the only
 * evidence there is.
 */
function keptReason(task: Task): TaskKeptReason | null {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'in_progress') return 'in_progress';
  return null;
}

/**
 * "The rest of these aren't happening" — drop this occurrence and the later
 * untouched ones, and pull the series' end date back to match.
 *
 * Mirrors assignmentSeriesRepo.stopRepeatingFrom, including its refusal to cut
 * from the first occurrence: that would leave a rule with nothing under it, and
 * deleteTaskSeries already covers "stop repeating" properly.
 */
export function stopRepeatingFrom(input: StopRepeatingTasksInput): StopRepeatingTasksResult {
  const db = getDb();
  const anchor = getTask(input.taskId);
  if (!anchor) throw new Error('Task not found');
  if (!anchor.series_id || anchor.series_index == null) {
    throw new Error('That task is not part of a series');
  }

  const series = getTaskSeries(anchor.series_id);
  if (!series) throw new Error('Series not found');

  const all = listBySeries(series.id);
  const cutFrom = anchor.series_index;
  if (!all.some(t => (t.series_index ?? 0) < cutFrom)) {
    throw new Error('Nothing would be left — use “stop repeating” to drop the series instead');
  }

  const removed: Task[] = [];
  const kept: StopRepeatingTasksResult['kept'] = [];
  for (const occurrence of all) {
    if ((occurrence.series_index ?? 0) < cutFrom) continue;
    const reason = keptReason(occurrence);
    if (reason) kept.push({ id: occurrence.id, name: occurrence.name, reason });
    else removed.push(occurrence);
  }

  const removedIds = new Set(removed.map(t => t.id));
  const remaining = all.filter(t => !removedIds.has(t.id));
  // The end date follows the rows: whatever is still standing, latest first.
  const untilDate = remaining.reduce(
    (latest, t) => (t.due_date > latest ? t.due_date : latest),
    remaining[0].due_date,
  );

  db.exec('BEGIN');
  try {
    const del = db.prepare('DELETE FROM tasks WHERE id = ?');
    for (const task of removed) del.run(task.id);
    db.prepare('UPDATE task_series SET until_date = ? WHERE id = ?').run(untilDate, series.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { seriesId: series.id, removed, kept, previousUntilDate: series.until_date };
}

/** The Undo: the rows come back under their own ids, and the series' end date
 *  with them, in one transaction. */
export function restoreOccurrences(input: RestoreTaskOccurrencesInput): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    for (const task of input.tasks) writeTask(task);
    db.prepare('UPDATE task_series SET until_date = ? WHERE id = ?').run(
      input.untilDate,
      input.seriesId,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
