import { getDb } from '../connection';
import type { Term, CreateTermInput, UpdateTermInput } from '../../../shared/types';

function row(r: unknown): Term {
  return r as Term;
}

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

export function deleteTerm(id: string): void {
  // Nulls out term_id on any courses that referenced this term
  getDb().prepare('UPDATE courses SET term_id = NULL WHERE term_id = ?').run(id);
  getDb().prepare('DELETE FROM terms WHERE id = ?').run(id);
}
