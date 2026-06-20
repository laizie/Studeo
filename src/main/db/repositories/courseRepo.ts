import { getDb } from '../connection';
import type {
  Course,
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

export function deleteCourse(id: string): void {
  getDb().prepare('DELETE FROM courses WHERE id = ?').run(id);
}
