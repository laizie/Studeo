import { getDb } from '../connection';
import { asRow } from '../rows';
import type { Term, CreateTermInput, UpdateTermInput } from '../../../shared/types';

const row = (r: unknown): Term => asRow<Term>(r);

export function listTerms(): Term[] {
  return (getDb().prepare('SELECT * FROM terms ORDER BY start_date DESC, name').all() as unknown[]).map(row);
}

export function getTerm(id: string): Term | null {
  const r = getDb().prepare('SELECT * FROM terms WHERE id = ?').get(id);
  return r ? row(r) : null;
}

export function createTerm(input: CreateTermInput): Term {
  const id = crypto.randomUUID();
  getDb()
    .prepare('INSERT INTO terms (id, name, start_date, end_date) VALUES (?, ?, ?, ?)')
    .run(id, input.name, input.startDate ?? null, input.endDate ?? null);
  return getTerm(id)!;
}

export function updateTerm(id: string, input: UpdateTermInput): Term {
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (input.name      !== undefined) { fields.push('name = ?');       values.push(input.name); }
  if (input.startDate !== undefined) { fields.push('start_date = ?'); values.push(input.startDate ?? null); }
  if (input.endDate   !== undefined) { fields.push('end_date = ?');   values.push(input.endDate ?? null); }

  if (fields.length > 0) {
    values.push(id);
    getDb().prepare(`UPDATE terms SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getTerm(id)!;
}

/**
 * Delete a term, unfiling its courses first.
 *
 * Both writes in one transaction: courses.term_id has a plain REFERENCES with no
 * ON DELETE rule, so the DELETE fails outright while any course still points at the
 * term. Run as two independent statements, a failure on the second would leave every
 * course silently unfiled from a term that still exists — the halfway state is worse
 * than either end. Every other multi-write path in this layer is already wrapped;
 * this one was the exception.
 */
export function deleteTerm(id: string): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE courses SET term_id = NULL WHERE term_id = ?').run(id);
    db.prepare('DELETE FROM terms WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
