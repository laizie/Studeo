import { getDb } from '../connection';
import type {
  Course,
  CourseSnapshot,
  Assignment,
  Subtask,
  ClassMeeting,
  MeetingException,
  StudyBlock,
  NoteLink,
  CreateCourseInput,
  UpdateCourseInput,
} from '../../../shared/types';

// node:sqlite returns null-prototype row objects. We cast through `unknown`
// then to our typed interfaces — safe because the columns exactly match.
function row(r: unknown): Course {
  return r as Course;
}

export function listCourses(): Course[] {
  return (getDb().prepare('SELECT * FROM courses ORDER BY name').all() as unknown[]).map(row);
}

export function getCourse(id: string): Course | null {
  const r = getDb().prepare('SELECT * FROM courses WHERE id = ?').get(id);
  return r ? row(r) : null;
}

export function createCourse(input: CreateCourseInput): Course {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      'INSERT INTO courses (id, name, abbreviation, color, building, term_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, input.name, input.abbreviation, input.color, input.building ?? null, input.termId ?? null, now);
  return getCourse(id)!;
}

export function updateCourse(id: string, input: UpdateCourseInput): Course {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (input.name !== undefined)         { fields.push('name = ?');         values.push(input.name); }
  if (input.abbreviation !== undefined) { fields.push('abbreviation = ?'); values.push(input.abbreviation); }
  if (input.color !== undefined)        { fields.push('color = ?');        values.push(input.color); }
  if (input.building !== undefined)     { fields.push('building = ?');     values.push(input.building ?? null); }
  if (input.termId !== undefined)       { fields.push('term_id = ?');      values.push(input.termId ?? null); }
  if (input.gradeSections !== undefined) {
    // Stored in the (legacy-named) grade_weights JSON column as a GradeSection[].
    fields.push('grade_weights = ?');
    values.push(input.gradeSections === null ? null : JSON.stringify(input.gradeSections));
  }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE courses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getCourse(id)!;
}

/**
 * Delete a course and everything it owns, returning a snapshot taken first so
 * the renderer can offer Undo. One transaction:
 *  - study sessions keep their history but drop the course link (course_id → NULL) —
 *    without this the FK on study_sessions.course_id (no ON DELETE rule) would
 *    make the whole delete fail for any course that was ever studied;
 *  - study blocks planned for the course are removed (directly, or via the
 *    assignment CASCADE for exam back-planning blocks);
 *  - notes survive; only their links to this course are removed;
 *  - assignments → subtasks and class meetings → exceptions go via ON DELETE CASCADE.
 */
export function deleteCourse(id: string): CourseSnapshot {
  const db = getDb();
  const course = getCourse(id);
  if (!course) throw new Error('Course not found');

  const snapshot: CourseSnapshot = {
    course,
    assignments: db
      .prepare('SELECT * FROM assignments WHERE course_id = ?')
      .all(id) as unknown as Assignment[],
    subtasks: db
      .prepare(
        'SELECT s.* FROM subtasks s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = ?'
      )
      .all(id) as unknown as Subtask[],
    classMeetings: db
      .prepare('SELECT * FROM class_meetings WHERE course_id = ?')
      .all(id) as unknown as ClassMeeting[],
    meetingExceptions: db
      .prepare(
        'SELECT e.* FROM meeting_exceptions e JOIN class_meetings m ON m.id = e.meeting_id WHERE m.course_id = ?'
      )
      .all(id) as unknown as MeetingException[],
    studyBlocks: db
      .prepare(
        'SELECT * FROM study_blocks WHERE course_id = ? OR assignment_id IN (SELECT id FROM assignments WHERE course_id = ?)'
      )
      .all(id, id) as unknown as StudyBlock[],
    studySessionIds: (
      db.prepare('SELECT id FROM study_sessions WHERE course_id = ?').all(id) as { id: string }[]
    ).map(r => r.id),
    noteLinks: db
      .prepare("SELECT * FROM note_links WHERE entity_type = 'course' AND entity_id = ?")
      .all(id) as unknown as NoteLink[],
  };

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE study_sessions SET course_id = NULL WHERE course_id = ?').run(id);
    db.prepare('DELETE FROM study_blocks WHERE course_id = ?').run(id);
    db.prepare("DELETE FROM note_links WHERE entity_type = 'course' AND entity_id = ?").run(id);
    db.prepare('DELETE FROM courses WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return snapshot;
}

/**
 * Put a deleted course back exactly as it was — same ids everywhere, so notes
 * linked to its assignments and lectures resolve again. The inverse of
 * deleteCourse; powers the Undo toast.
 */
export function restoreCourse(snap: CourseSnapshot): Course {
  const db = getDb();
  const c = snap.course;

  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO courses (id, name, abbreviation, color, building, term_id, grade_weights, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(c.id, c.name, c.abbreviation, c.color, c.building, c.term_id, c.grade_weights, c.created_at);

    const insertAssignment = db.prepare(
      `INSERT INTO assignments (id, course_id, name, type, status, due_date, due_time, notes, score, points_possible, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const a of snap.assignments) {
      insertAssignment.run(
        a.id, a.course_id, a.name, a.type, a.status, a.due_date, a.due_time,
        a.notes, a.score, a.points_possible, a.completed_at, a.created_at,
      );
    }

    const insertSubtask = db.prepare(
      'INSERT INTO subtasks (id, assignment_id, name, completed, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const s of snap.subtasks) {
      insertSubtask.run(s.id, s.assignment_id, s.name, s.completed, s.sort_order, s.created_at);
    }

    const insertMeeting = db.prepare(
      'INSERT INTO class_meetings (id, course_id, day_of_week, start_time, end_time, location) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const m of snap.classMeetings) {
      insertMeeting.run(m.id, m.course_id, m.day_of_week, m.start_time, m.end_time, m.location);
    }

    const insertException = db.prepare(
      `INSERT INTO meeting_exceptions (id, meeting_id, date, kind, new_start_time, new_end_time, new_location)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of snap.meetingExceptions) {
      insertException.run(e.id, e.meeting_id, e.date, e.kind, e.new_start_time, e.new_end_time, e.new_location);
    }

    const insertBlock = db.prepare(
      `INSERT INTO study_blocks (id, assignment_id, course_id, title, scheduled_date, duration_minutes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const b of snap.studyBlocks) {
      insertBlock.run(b.id, b.assignment_id, b.course_id, b.title, b.scheduled_date, b.duration_minutes, b.status, b.created_at);
    }

    // Re-link surviving study sessions. A missing id (session deleted meanwhile)
    // makes this a harmless no-op update.
    const relinkSession = db.prepare('UPDATE study_sessions SET course_id = ? WHERE id = ?');
    for (const sid of snap.studySessionIds) relinkSession.run(c.id, sid);

    // OR IGNORE: if the same link was somehow recreated in the undo window,
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

  return getCourse(c.id)!;
}
