import { getDb } from '../connection';
import { asRow } from '../rows';
import { generateRepeats } from '../../../shared/repeat';
import { createTask, listBySeries } from './taskRepo';
import type {
  Task,
  TaskSeries,
  TaskSeriesWithOccurrences,
  CreateTaskSeriesInput,
  ExtendTaskSeriesInput,
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
