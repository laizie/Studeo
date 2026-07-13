import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Build an in-memory DB with the real schema by running every migration in
// order — same path production takes, so the tests can't drift from it.
//
// Foreign keys are enforced here exactly as connection.ts does. Without that,
// the test DB is more permissive than the real one: cascades don't fire and a
// delete blocked by a referencing row still "passes" — which is how a course
// delete that a study session made impossible could look fine in tests.
export function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const dir = join(process.cwd(), 'src/main/db/migrations');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    db.exec(readFileSync(join(dir, file), 'utf-8'));
  }
  return db;
}
