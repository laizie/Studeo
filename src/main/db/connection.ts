import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { app } from 'electron';

// Vite inlines these .sql files as strings at build time (?raw suffix).
// This means the SQL always travels with the bundle — no separate file copying needed.
import migration001 from './migrations/001_initial.sql?raw';
import migration002 from './migrations/002_meeting_exceptions.sql?raw';
import migration003 from './migrations/003_subtasks.sql?raw';
import migration004 from './migrations/004_grades.sql?raw';
import migration005 from './migrations/005_notes.sql?raw';

let db: DatabaseSync | null = null;
let dbPath: string | null = null;

export function getDb(): DatabaseSync {
  if (!db) throw new Error('[DB] Database not initialized — call initDb() first');
  return db;
}

export function getDbPath(): string {
  if (!dbPath) throw new Error('[DB] Database not initialized — call initDb() first');
  return dbPath;
}

export function initDb(): void {
  // app.getPath('userData') resolves to the OS-appropriate app data folder:
  //   macOS:   ~/Library/Application Support/Studeo
  //   Windows: %APPDATA%\Studeo
  dbPath = path.join(app.getPath('userData'), 'studeo.db');

  db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });

  // WAL (Write-Ahead Log) mode is faster for apps that read and write frequently.
  db.exec('PRAGMA journal_mode = WAL');

  runMigrations(db);
  console.log('[DB] Ready at', dbPath);
}

// ─── Migration runner ─────────────────────────────────────────────────────────
// Migrations run in order on every startup; already-applied ones are skipped.
// To add a new migration: import its SQL above and append a new entry below.

const MIGRATIONS: { name: string; sql: string }[] = [
  { name: '001_initial.sql', sql: migration001 },
  { name: '002_meeting_exceptions.sql', sql: migration002 },
  { name: '003_subtasks.sql', sql: migration003 },
  { name: '004_grades.sql', sql: migration004 },
  { name: '005_notes.sql', sql: migration005 },
];

function runMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT    NOT NULL UNIQUE,
      run_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const ran = new Set<string>(
    (database.prepare('SELECT name FROM _migrations').all() as { name: string }[])
      .map(r => r.name)
  );

  for (const { name, sql } of MIGRATIONS) {
    if (ran.has(name)) continue;
    database.exec(sql);
    database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    console.log(`[DB] Migration applied: ${name}`);
  }
}
