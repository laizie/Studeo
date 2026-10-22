import { getDb } from '../connection';
import { asRow } from '../rows';
import { shiftDate, shiftSkipReason } from '../../../shared/repeat';
import type {
  Assignment,
  DateChange,
  DateSet,
  AssignmentSnapshot,
  AssignmentStatus,
  SeriesScope,
  ShiftAssignmentsInput,
  ShiftResult,
  Subtask,
  StudyBlock,
  NoteLink,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from '../../../shared/types';

const row = (r: unknown): Assignment => asRow<Assignment>(r);

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
      'INSERT INTO assignments (id, course_id, name, type, status, due_date, due_time, notes, score, points_possible, completed_at, series_id, series_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
      input.seriesId ?? null,
      input.seriesIndex ?? null,
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

/**
 * Delete an assignment and everything that dies with it, returning a snapshot first so
 * the renderer can offer a real Undo. One transaction.
 *
 * The old version was a bare DELETE, and Undo re-created the row through the normal
 * create path — so it came back with a NEW id, and its steps, planned study blocks,
 * note links, original created_at and completed_at were all gone. Same shape as
 * deleteCourse/restoreCourse, which already got this right.
 *
 * Note links are captured here rather than in the handler (where deleteLinksForEntity
 * used to run) for the same reason as in courseRepo: whatever is removed has to be
 * captured in the same place, or the two drift and Undo silently restores less.
 */
export function deleteAssignment(id: string): AssignmentSnapshot | null {
  const db = getDb();
  const assignment = getAssignment(id);
  // Already gone is a no-op, not an error — and there's nothing to undo.
  if (!assignment) return null;

  const snapshot: AssignmentSnapshot = {
    assignment,
    subtasks: db
      .prepare('SELECT * FROM subtasks WHERE assignment_id = ?')
      .all(id) as unknown as Subtask[],
    studyBlocks: db
      .prepare('SELECT * FROM study_blocks WHERE assignment_id = ?')
      .all(id) as unknown as StudyBlock[],
    noteLinks: db
      .prepare("SELECT * FROM note_links WHERE entity_type = 'assignment' AND entity_id = ?")
      .all(id) as unknown as NoteLink[],
  };

  db.exec('BEGIN');
  try {
    db.prepare("DELETE FROM note_links WHERE entity_type = 'assignment' AND entity_id = ?").run(id);
    // subtasks and study_blocks go via ON DELETE CASCADE.
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return snapshot;
}

/** The inverse of deleteAssignment — same ids everywhere, so linked notes resolve again. */
export function restoreAssignment(snap: AssignmentSnapshot): Assignment {
  const db = getDb();
  const a = snap.assignment;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO assignments (id, course_id, name, type, status, due_date, due_time, notes, score, points_possible, completed_at, series_id, series_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      a.id, a.course_id, a.name, a.type, a.status, a.due_date, a.due_time,
      a.notes, a.score, a.points_possible, a.completed_at,
      a.series_id, a.series_index, a.created_at,
    );

    const insertSubtask = db.prepare(
      'INSERT INTO subtasks (id, assignment_id, name, completed, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const s of snap.subtasks) {
      insertSubtask.run(s.id, s.assignment_id, s.name, s.completed, s.sort_order, s.created_at);
    }

    const insertBlock = db.prepare(
      `INSERT INTO study_blocks (id, assignment_id, course_id, title, scheduled_date, duration_minutes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const b of snap.studyBlocks) {
      insertBlock.run(b.id, b.assignment_id, b.course_id, b.title, b.scheduled_date, b.duration_minutes, b.status, b.created_at);
    }

    // OR IGNORE: if an identical link was somehow recreated inside the undo window,
    // restoring shouldn't fail over it.
    const insertLink = db.prepare(
      `INSERT OR IGNORE INTO note_links (id, note_id, entity_type, entity_id, occurrence_date, is_pinned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of snap.noteLinks) {
      insertLink.run(l.id, l.note_id, l.entity_type, l.entity_id, l.occurrence_date, l.is_pinned, l.created_at);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getAssignment(a.id)!;
}

// ─── Moving dates in bulk ─────────────────────────────────────────────────────

/** Every occurrence of a series, in series order (not date order — see series_index). */
export function listBySeries(seriesId: string): Assignment[] {
  return (
    getDb()
      .prepare('SELECT * FROM assignments WHERE series_id = ? ORDER BY series_index ASC')
      .all(seriesId) as unknown[]
  ).map(row);
}

/**
 * Write new due dates for several rows in one transaction — every row lands or
 * none do.
 *
 * useRescheduleItems fans out to per-row update() calls and its own comment
 * named this as the cue to add a real bulk channel: "If this ever needs to be
 * atomic — all-or-nothing across rows — that's the cue to add a real updateMany
 * IPC handler wrapped in a DB transaction." A twelve-row series shift is that
 * case, because a half-applied shift leaves a schedule nobody can reason about.
 *
 * Only due_date, deliberately: this is the bulk path for the one field bulk
 * edits are actually about, so it can't become a general-purpose back door
 * around updateAssignment's completed_at bookkeeping.
 */
export function setDates(items: DateSet[]): number {
  if (items.length === 0) return 0;

  const db = getDb();
  db.exec('BEGIN');
  try {
    const stmt = db.prepare('UPDATE assignments SET due_date = ? WHERE id = ?');
    for (const item of items) stmt.run(item.dueDate, item.id);
    db.exec('COMMIT');
    return items.length;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Which rows a scope reaches. 'this_and_later' leans on series_index rather than
 *  due_date so an occurrence already dragged out of order still counts as "later
 *  in the series". A row with no series only ever means itself. */
function scopeTargets(anchor: Assignment, scope: SeriesScope): Assignment[] {
  if (scope === 'one' || !anchor.series_id || anchor.series_index == null) return [anchor];

  const db = getDb();
  const rows =
    scope === 'all'
      ? db
          .prepare('SELECT * FROM assignments WHERE series_id = ? ORDER BY series_index ASC')
          .all(anchor.series_id)
      : db
          .prepare(
            'SELECT * FROM assignments WHERE series_id = ? AND series_index >= ? ORDER BY series_index ASC'
          )
          .all(anchor.series_id, anchor.series_index);

  return (rows as unknown[]).map(row);
}

/**
 * Move an occurrence — and optionally the rest of its series — by a number of days.
 *
 * The anchor row always moves: the user pointed at it and asked. The *other*
 * rows the scope swept up are collateral, so finished work among them is left
 * alone and reported back (shiftSkipReason). Sliding a graded assignment because
 * the rest of the series moved would rewrite history the user never asked about.
 *
 * Returns before/after for every row it touched, which is exactly what Undo
 * needs: replay it through setDates with the `from` dates and each row goes back
 * to the different date it personally had.
 */
export function shiftAssignments(input: ShiftAssignmentsInput): ShiftResult {
  const anchor = getAssignment(input.assignmentId);
  if (!anchor) throw new Error('Assignment not found');

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
    // '' means the stored date didn't parse; a no-op date isn't worth a write.
    if (!to || to === occurrence.due_date) continue;
    changed.push({ id: occurrence.id, from: occurrence.due_date, to });
  }

  setDates(changed.map(c => ({ id: c.id, dueDate: c.to })));
  return { changed, skipped };
}
