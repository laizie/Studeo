import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Build an in-memory DB with the real schema by running every migration in
// order — same path production takes, so the tests can't drift from it.
export function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  const dir = join(process.cwd(), 'src/main/db/migrations');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    db.exec(readFileSync(join(dir, file), 'utf-8'));
  }
  return db;
}
