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
import migration006 from './migrations/006_note_links.sql?raw';
import migration007 from './migrations/007_note_link_pin.sql?raw';
import migration008 from './migrations/008_note_versions.sql?raw';
import migration009 from './migrations/009_note_date.sql?raw';
import migration010 from './migrations/010_note_pin.sql?raw';
import migration011 from './migrations/011_study_session_reflection.sql?raw';
import migration012 from './migrations/012_study_blocks.sql?raw';

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

// ─── Restore support ──────────────────────────────────────────────────────────
// Helpers used by the "restore from backup" flow. They keep all node:sqlite
// usage inside this db module; the IPC handler orchestrates the file swap.

// Close the live connection so the OS releases the file handle before the
// database file is overwritten (required on Windows, clean everywhere).
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Write a consistent single-file snapshot of the live database to targetPath.
// VACUUM INTO captures a clean copy even in WAL mode — the same mechanism the
// backup feature uses — so we reuse it to snapshot current data before a restore.
export function snapshotInto(targetPath: string): void {
  getDb().prepare('VACUUM INTO ?').run(targetPath);
}

// Throw a friendly error if filePath is not a readable Studeo database. Opens
// read-only (so we never create WAL sidecars next to the candidate file) and
// checks for the core tables every Studeo database has.
export function validateBackupFile(filePath: string): void {
  const NOT_A_BACKUP = "That file isn't a Studeo backup.";
  let test: DatabaseSync | null = null;
  try {
    test = new DatabaseSync(filePath, { readOnly: true });
    const tables = new Set(
      (test.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
        .map(r => r.name),
    );
    for (const required of ['courses', 'assignments', '_migrations']) {
      if (!tables.has(required)) throw new Error(NOT_A_BACKUP);
    }
  } catch (err) {
    if (err instanceof Error && err.message === NOT_A_BACKUP) throw err;
    // Anything else (not a SQLite file, unreadable, etc.) → same user-facing message.
    throw new Error("That file couldn't be read as a Studeo backup.");
  } finally {
    test?.close();
  }
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
  { name: '006_note_links.sql', sql: migration006 },
  { name: '007_note_link_pin.sql', sql: migration007 },
  { name: '008_note_versions.sql', sql: migration008 },
  { name: '009_note_date.sql', sql: migration009 },
  { name: '010_note_pin.sql', sql: migration010 },
  { name: '011_study_session_reflection.sql', sql: migration011 },
  { name: '012_study_blocks.sql', sql: migration012 },
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
