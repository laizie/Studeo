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

  // Foreign keys are OFF for the duration of the schema build, then back ON — mirroring
  // what connection.ts does for a table-rebuild migration (see Migration.foreignKeysOff).
  //
  // It happens not to matter on a fresh empty database, which is exactly why it's worth
  // being explicit: a rebuild migration like 016 drops and recreates `assignments`, and
  // with enforcement ON that DROP cascade-deletes every subtask and study block. On an
  // empty test DB there's nothing to lose, so a test suite would sail past a mistake that
  // destroys a real user's data. Building the schema the same way production does keeps
  // this helper honest.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const file of files) {
      db.exec(readFileSync(join(dir, file), 'utf-8'));
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}
