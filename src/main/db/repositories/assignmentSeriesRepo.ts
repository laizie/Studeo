import { getDb } from '../connection';
import { asRow } from '../rows';
import { generateRepeats } from '../../../shared/repeat';
import { createAssignment, listBySeries } from './assignmentRepo';
import type {
  Assignment,
  AssignmentSeries,
  AssignmentSeriesWithOccurrences,
  CreateAssignmentSeriesInput,
  ExtendAssignmentSeriesInput,
} from '../../../shared/types';

const row = (r: unknown): AssignmentSeries => asRow<AssignmentSeries>(r);

export function listAssignmentSeries(filters: { courseId?: string } = {}): AssignmentSeries[] {
  if (filters.courseId) {
    return (
      getDb()
        .prepare('SELECT * FROM assignment_series WHERE course_id = ? ORDER BY anchor_date ASC')
        .all(filters.courseId) as unknown[]
    ).map(row);
  }
  return (
    getDb().prepare('SELECT * FROM assignment_series ORDER BY anchor_date ASC').all() as unknown[]
  ).map(row);
}

export function getAssignmentSeries(id: string): AssignmentSeries | null {
  const r = getDb().prepare('SELECT * FROM assignment_series WHERE id = ?').get(id);
  return r ? row(r) : null;
}

/**
 * Create a repeating assignment: the rule, plus every occurrence it expands to,
 * in one transaction. Either the whole series lands or none of it does — a
 * half-saved semester is worse than a failed save.
 *
 * The expansion itself is still generateRepeats, unchanged and already tested.
 * The only new thing is that each row is stamped with the series id and its
 * 1-based position, so a later "move this and the rest" knows what "the rest" is.
 */
export function createAssignmentSeries(
  input: CreateAssignmentSeriesInput,
): AssignmentSeriesWithOccurrences {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const type = input.type ?? 'Assignment';
  const dueTime = input.dueTime ?? null;
  const followUps = generateRepeats(
    input.name,
    input.anchorDate,
    input.untilDate,
    input.intervalWeeks,
  );

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO assignment_series
         (id, course_id, name_template, type, interval_weeks, anchor_date, until_date, due_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.courseId,
      input.name,
      type,
      input.intervalWeeks,
      input.anchorDate,
      input.untilDate,
      dueTime,
      now,
    );

    // The first occurrence is the one the user typed; the generated follow-ups
    // continue its numbering. Index is 1-based so it reads like "occurrence 3 of 12".
    const assignments: Assignment[] = [
      createAssignment({
        courseId: input.courseId,
        name: input.name,
        type,
        dueDate: input.anchorDate,
        dueTime,
        seriesId: id,
        seriesIndex: 1,
      }),
      ...followUps.map((occurrence, i) =>
        createAssignment({
          courseId: input.courseId,
          name: occurrence.name,
          type,
          dueDate: occurrence.dueDate,
          dueTime,
          seriesId: id,
          seriesIndex: i + 2,
        }),
      ),
    ];

    db.exec('COMMIT');
    return { series: getAssignmentSeries(id)!, assignments };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Push a series' end date out and append the occurrences that now fit — "the
 * syllabus said ten, the prof added two".
 *
 * Continues from the LAST existing occurrence rather than recomputing from the
 * anchor, so an occurrence that was moved by hand doesn't get duplicated and the
 * numbering picks up where the real rows left off ("Homework 10" → "Homework 11").
 * Returns only the newly created rows; the existing ones are untouched.
 */
export function extendAssignmentSeries(
  input: ExtendAssignmentSeriesInput,
): AssignmentSeriesWithOccurrences {
  const db = getDb();
  const series = getAssignmentSeries(input.seriesId);
  if (!series) throw new Error('Series not found');

  const existing = listBySeries(series.id);
  const last = existing[existing.length - 1];
  // Every occurrence deleted by hand? Fall back to the rule's own anchor, so
  // extending still has somewhere to continue from.
  const fromName = last?.name ?? series.name_template;
  const fromDate = last?.due_date ?? series.anchor_date;
  const nextIndex = (last?.series_index ?? 0) + 1;

  const followUps = generateRepeats(fromName, fromDate, input.untilDate, series.interval_weeks);

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE assignment_series SET until_date = ? WHERE id = ?').run(
      input.untilDate,
      series.id,
    );

    const assignments = followUps.map((occurrence, i) =>
      createAssignment({
        courseId: series.course_id,
        name: occurrence.name,
        type: series.type,
        dueDate: occurrence.dueDate,
        dueTime: series.due_time,
        seriesId: series.id,
        seriesIndex: nextIndex + i,
      }),
    );

    db.exec('COMMIT');
    return { series: getAssignmentSeries(series.id)!, assignments };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * "Stop repeating this" — drops the rule and nothing else.
 *
 * Every occurrence survives as an ordinary one-off assignment, with its status,
 * score, subtasks and study blocks intact; they just stop being related. The
 * column is cleared explicitly rather than left to the FK's ON DELETE SET NULL
 * so series_index goes with it — a position in a series that no longer exists is
 * the kind of leftover that reads as data the next time someone queries it.
 */
export function deleteAssignmentSeries(id: string): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE assignments SET series_id = NULL, series_index = NULL WHERE series_id = ?').run(id);
    db.prepare('DELETE FROM assignment_series WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
