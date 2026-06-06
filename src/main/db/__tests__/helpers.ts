import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  const sql = readFileSync(
    join(process.cwd(), 'src/main/db/migrations/001_initial.sql'),
    'utf-8',
  );
  db.exec(sql);
  return db;
}
