import { getDb } from '../connection';
import { asRow } from '../rows';
import { generateRepeats } from '../../../shared/repeat';
import { createAssignment, getAssignment, listBySeries, writeSnapshot } from './assignmentRepo';
import type {
  Assignment,
  AssignmentBatchResult,
  AssignmentSnapshot,
  AssignmentSeries,
  AssignmentSeriesWithOccurrences,
  AssignmentType,
  CreateAssignmentBatchInput,
  CreateAssignmentSeriesFromRowsInput,
  CreateAssignmentSeriesInput,
  ExtendAssignmentSeriesInput,
  KeptReason,
  LinkIntoSeriesInput,
  RestoreOccurrencesInput,
  SeriesOccurrenceInput,
  StopRepeatingInput,
  StopRepeatingResult,
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
/**
 * Write a series row and its occurrences. No transaction of its own, so several
 * of these can compose into one batch (see createAssignmentBatch) — every caller
 * is responsible for wrapping it.
 *
 * Occurrences go in verbatim, numbered by their position in the array. An
 * occurrence's own type and time win over the series defaults, because a row the
 * user edited in the grid is the more specific statement of intent.
 */
function insertSeries(
  rule: {
    courseId: string;
    nameTemplate: string;
    type: AssignmentType;
    intervalWeeks: number;
    anchorDate: string;
    untilDate: string;
    dueTime: string | null;
  },
  occurrences: SeriesOccurrenceInput[],
): AssignmentSeriesWithOccurrences {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO assignment_series
         (id, course_id, name_template, type, interval_weeks, anchor_date, until_date, due_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      rule.courseId,
      rule.nameTemplate,
      rule.type,
      rule.intervalWeeks,
      rule.anchorDate,
      rule.untilDate,
      rule.dueTime,
      new Date().toISOString(),
    );

  const assignments = occurrences.map((occurrence, i) =>
    createAssignment({
      courseId: rule.courseId,
      name: occurrence.name,
      type: occurrence.type ?? rule.type,
      dueDate: occurrence.dueDate,
      dueTime: occurrence.dueTime ?? rule.dueTime,
      seriesId: id,
      // 1-based, so it reads like "occurrence 3 of 12".
      seriesIndex: i + 1,
    }),
  );

  return { series: getAssignmentSeries(id)!, assignments };
}

export function createAssignmentSeries(
  input: CreateAssignmentSeriesInput,
): AssignmentSeriesWithOccurrences {
  const db = getDb();
  const type = input.type ?? 'Assignment';
  const dueTime = input.dueTime ?? null;

  // The first occurrence is the one the user typed; generateRepeats continues its
  // numbering from there.
  const occurrences: SeriesOccurrenceInput[] = [
    { name: input.name, type, dueDate: input.anchorDate, dueTime },
    ...generateRepeats(input.name, input.anchorDate, input.untilDate, input.intervalWeeks).map(
      o => ({ name: o.name, type, dueDate: o.dueDate, dueTime }),
    ),
  ];

  db.exec('BEGIN');
  try {
    const result = insertSeries(
      {
        courseId: input.courseId,
        nameTemplate: input.name,
        type,
        intervalWeeks: input.intervalWeeks,
        anchorDate: input.anchorDate,
        untilDate: input.untilDate,
        dueTime,
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

/**
 * Turn occurrences that already exist on screen into a real series.
 *
 * The rule fields are read back off the rows rather than taken on trust: the
 * first row is the template and the anchor, the last row's date is the end. By
 * the time Day-One Setup's grid is saved the user may have renamed, re-dated or
 * deleted any of the generated rows, so the rows are the only honest account of
 * what the series actually is.
 */
export function createAssignmentSeriesFromRows(
  input: CreateAssignmentSeriesFromRowsInput,
): AssignmentSeriesWithOccurrences {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = insertSeriesFromRows(input);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** The transaction-free half, so the batch below can run many of these at once. */
function insertSeriesFromRows(
  input: CreateAssignmentSeriesFromRowsInput,
): AssignmentSeriesWithOccurrences {
  const first = input.occurrences[0];
  const last = input.occurrences[input.occurrences.length - 1];

  return insertSeries(
    {
      courseId: input.courseId,
      nameTemplate: first.name,
      type: first.type ?? 'Assignment',
      intervalWeeks: input.intervalWeeks,
      anchorDate: first.dueDate,
      untilDate: last.dueDate,
      dueTime: first.dueTime ?? null,
    },
    input.occurrences,
  );
}

/**
 * Save a whole grid at once: every repeating group and every one-off row, in a
 * single transaction.
 *
 * Day-One Setup's promise has always been that a failed save leaves nothing
 * behind — the point of absorbing a syllabus in one sitting is not having to
 * work out afterwards which half of it landed. Series and singles therefore
 * cannot go as two calls, however tempting; one bad row anywhere has to take the
 * whole grid down with it.
 */
export function createAssignmentBatch(input: CreateAssignmentBatchInput): AssignmentBatchResult {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const series: AssignmentSeries[] = [];
    const assignments: Assignment[] = [];

    for (const group of input.series) {
      const created = insertSeriesFromRows(group);
      series.push(created.series);
      assignments.push(...created.assignments);
    }
    for (const single of input.singles) {
      assignments.push(createAssignment(single));
    }

    db.exec('COMMIT');
    return { series, assignments };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Bind assignments that already exist into a series.
 *
 * The escape hatch for rows created before series existed — a semester of
 * homework added one at a time, or anything the ICS importer produced. The rows
 * are already right; all they lack is the knowledge that they belong together.
 *
 * So this writes the rule and stamps the rows, and touches nothing else. Names
 * in particular are left exactly as they are: linking says what these rows ARE,
 * and rewriting a dozen names as a side effect of that would be a second,
 * larger decision taken on the user's behalf. A scoped rename afterwards is one
 * click away and visibly their choice.
 *
 * Every id is re-checked here rather than trusted from the caller: the list came
 * from a suggestion the user may have been looking at for a while, and a row
 * could have been deleted, moved to another course, or linked elsewhere since.
 */
export function linkIntoSeries(input: LinkIntoSeriesInput): AssignmentSeriesWithOccurrences {
  const db = getDb();

  const rows = input.assignmentIds.map(id => {
    const assignment = getAssignment(id);
    if (!assignment) throw new Error('One of those assignments no longer exists');
    if (assignment.course_id !== input.courseId) {
      throw new Error('One of those assignments belongs to a different course');
    }
    if (assignment.series_id !== null) {
      throw new Error('One of those assignments is already part of a series');
    }
    return assignment;
  });

  if (rows.length < 2) throw new Error('A series needs at least two assignments');

  const first = rows[0];
  const last = rows[rows.length - 1];
  const id = crypto.randomUUID();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO assignment_series
         (id, course_id, name_template, type, interval_weeks, anchor_date, until_date, due_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.courseId,
      first.name,
      first.type,
      input.intervalWeeks,
      first.due_date,
      last.due_date,
      first.due_time,
      new Date().toISOString(),
    );

    const stamp = db.prepare('UPDATE assignments SET series_id = ?, series_index = ? WHERE id = ?');
    rows.forEach((assignment, i) => stamp.run(id, i + 1, assignment.id));

    db.exec('COMMIT');
    return { series: getAssignmentSeries(id)!, assignments: listBySeries(id) };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ─── Cutting a series short ───────────────────────────────────────────────────

/**
 * Why this occurrence is not a placeholder, or null if it is.
 *
 * The bar is deliberately higher than the one a date shift uses. A shift that
 * skips an occurrence leaves it sitting there; a cut deletes it. So anything
 * with a grade, a tick, a step, a planned study block or a linked note counts
 * as work somebody did, and work somebody did is not swept up by a scheduling
 * decision — whatever the status column happens to say.
 */
function keptReason(assignment: Assignment): KeptReason | null {
  if (assignment.status === 'completed') return 'completed';
  if (assignment.score != null) return 'graded';
  if (assignment.status === 'in_progress') return 'in_progress';

  const db = getDb();
  const hasWork =
    db.prepare('SELECT 1 FROM subtasks WHERE assignment_id = ? LIMIT 1').get(assignment.id) ??
    db.prepare('SELECT 1 FROM study_blocks WHERE assignment_id = ? LIMIT 1').get(assignment.id) ??
    db
      .prepare("SELECT 1 FROM note_links WHERE entity_type = 'assignment' AND entity_id = ? LIMIT 1")
      .get(assignment.id);

  return hasWork ? 'has_work' : null;
}

/**
 * "The rest of these aren't happening" — drop this occurrence and the later ones
 * that are still untouched, and pull the series' end date back to match.
 *
 * Cutting from the FIRST occurrence is refused. That isn't shortening a series,
 * it's deleting one, and it would leave a rule with nothing under it — plus an
 * Undo that has to resurrect the series row as well as its rows. "Stop
 * repeating" (deleteAssignmentSeries) already covers that case properly, so this
 * action stays the simple one it looks like.
 *
 * Everything it removes comes back as a full snapshot, so Undo restores the rows
 * under their original ids and the end date with them.
 */
export function stopRepeatingFrom(input: StopRepeatingInput): StopRepeatingResult {
  const db = getDb();
  const anchor = getAssignment(input.assignmentId);
  if (!anchor) throw new Error('Assignment not found');
  if (!anchor.series_id || anchor.series_index == null) {
    throw new Error('That assignment is not part of a series');
  }

  const series = getAssignmentSeries(anchor.series_id);
  if (!series) throw new Error('Series not found');

  const all = listBySeries(series.id);
  const cutFrom = anchor.series_index;
  if (!all.some(a => (a.series_index ?? 0) < cutFrom)) {
    throw new Error('Nothing would be left — use “stop repeating” to drop the series instead');
  }

  const removed: AssignmentSnapshot[] = [];
  const kept: StopRepeatingResult['kept'] = [];
  for (const occurrence of all) {
    if ((occurrence.series_index ?? 0) < cutFrom) continue;
    const reason = keptReason(occurrence);
    if (reason) {
      kept.push({ id: occurrence.id, name: occurrence.name, reason });
      continue;
    }
    // Droppable means nothing hangs off it, so the snapshot's child lists are
    // empty by construction — which is also why this can delete the rows with a
    // plain DELETE rather than going through deleteAssignment's own transaction.
    removed.push({ assignment: occurrence, subtasks: [], studyBlocks: [], noteLinks: [] });
  }

  const removedIds = new Set(removed.map(r => r.assignment.id));
  const remaining = all.filter(a => !removedIds.has(a.id));
  // The end date follows the rows: whatever is still standing, latest first.
  const untilDate = remaining.reduce(
    (latest, a) => (a.due_date > latest ? a.due_date : latest),
    remaining[0].due_date,
  );

  db.exec('BEGIN');
  try {
    const del = db.prepare('DELETE FROM assignments WHERE id = ?');
    for (const snapshot of removed) del.run(snapshot.assignment.id);
    db.prepare('UPDATE assignment_series SET until_date = ? WHERE id = ?').run(untilDate, series.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { seriesId: series.id, removed, kept, previousUntilDate: series.until_date };
}

/** The Undo for the above: the rows come back under their own ids, and the
 *  series' end date comes back with them, in one transaction. */
export function restoreOccurrences(input: RestoreOccurrencesInput): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    for (const snapshot of input.snapshots) writeSnapshot(snapshot);
    db.prepare('UPDATE assignment_series SET until_date = ? WHERE id = ?').run(
      input.untilDate,
      input.seriesId,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
