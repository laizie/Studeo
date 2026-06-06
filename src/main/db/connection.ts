import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { app } from 'electron';

// Vite inlines these .sql files as strings at build time (?raw suffix).
// This means the SQL always travels with the bundle — no separate file copying needed.
import migration001 from './migrations/001_initial.sql?raw';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) throw new Error('[DB] Database not initialized — call initDb() first');
  return db;
}

export function initDb(): void {
  // app.getPath('userData') resolves to the OS-appropriate app data folder:
  //   macOS:   ~/Library/Application Support/Studeo
  //   Windows: %APPDATA%\Studeo
  const dbPath = path.join(app.getPath('userData'), 'studeo.db');

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
