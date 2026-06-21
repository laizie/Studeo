import { getDb } from '../connection';
import type {
  StudyBlock,
  CreateStudyBlockInput,
  UpdateStudyBlockInput,
} from '../../../shared/types';

function row(r: unknown): StudyBlock {
  return r as StudyBlock;
}

export function listStudyBlocks(): StudyBlock[] {
  return (
    getDb().prepare('SELECT * FROM study_blocks ORDER BY scheduled_date ASC').all() as unknown[]
  ).map(row);
}

export function getStudyBlock(id: string): StudyBlock | null {
  const r = getDb().prepare('SELECT * FROM study_blocks WHERE id = ?').get(id);
  return r ? row(r) : null;
}

// Insert a whole generated plan atomically — all rows save or none do, so a failure
// mid-way never leaves a half-written plan on the calendar.
export function createStudyBlocks(inputs: CreateStudyBlockInput[]): StudyBlock[] {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const ids: string[] = [];

  const insert = db.prepare(
    `INSERT INTO study_blocks
       (id, assignment_id, course_id, title, scheduled_date, duration_minutes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)`,
  );

  db.exec('BEGIN');
  try {
    for (const input of inputs) {
      const id = crypto.randomUUID();
      insert.run(
        id,
        input.assignmentId ?? null,
        input.courseId ?? null,
        input.title,
        input.scheduledDate,
        input.durationMinutes,
        createdAt,
      );
      ids.push(id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return ids.map((id) => getStudyBlock(id)!);
}

export function updateStudyBlock(id: string, input: UpdateStudyBlockInput): StudyBlock {
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (input.status !== undefined)        { fields.push('status = ?');         values.push(input.status); }
  if (input.scheduledDate !== undefined) { fields.push('scheduled_date = ?'); values.push(input.scheduledDate); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE study_blocks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getStudyBlock(id)!;
}

export function deleteStudyBlock(id: string): void {
  getDb().prepare('DELETE FROM study_blocks WHERE id = ?').run(id);
}

export function deleteStudyBlocksForAssignment(assignmentId: string): void {
  getDb().prepare('DELETE FROM study_blocks WHERE assignment_id = ?').run(assignmentId);
}
