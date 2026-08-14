import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { runDailyBackup, runPreUpgradeBackup } from './backups';

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
import migration013 from './migrations/013_assignment_due_time.sql?raw';
import migration014 from './migrations/014_completed_at.sql?raw';
import migration015 from './migrations/015_indexes.sql?raw';
import migration016 from './migrations/016_status_checks.sql?raw';

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

  // Checked before we open, because opening creates the file. A first run has no
  // data to protect, so it skips both snapshots below — there is nothing in an
  // empty database worth a copy, and a brand-new install would otherwise spend
  // its first launch backing up zero rows.
  const isFirstRun = !existsSync(dbPath);

  db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });

  // WAL (Write-Ahead Log) mode is faster for apps that read and write frequently.
  db.exec('PRAGMA journal_mode = WAL');

  // Snapshot before a schema change touches existing data. Each migration is
  // already transactional, so one that *fails* rolls back and needs no backup.
  // This covers the case a transaction can't: a migration that succeeds while
  // transforming data incorrectly. SQLite sees no error, commits, and the old
  // shape of the data is gone — unless a copy was taken first. New versions
  // arrive by auto-update, so this runs unattended; that's exactly when you want
  // the copy to already exist.
  if (!isFirstRun && pendingMigrations(db).length > 0) {
    runPreUpgradeBackup(snapshotInto);
  }

  runMigrations(db);

  // The everyday rolling snapshot, once per calendar day. After migrations, so
  // the file on disk always matches a schema this version can open.
  if (!isFirstRun) {
    runDailyBackup(snapshotInto);
  }

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

interface Migration {
  name: string;
  sql: string;
  /**
   * Run this migration with foreign-key enforcement disabled.
   *
   * Needed only for the twelve-step table rebuild SQLite requires when a constraint has
   * to change (there is no ALTER TABLE ADD CONSTRAINT). The trap: with foreign keys ON,
   * `DROP TABLE assignments` performs an implicit DELETE of every row first — which
   * fires ON DELETE CASCADE and would silently wipe every subtask and study block in
   * the database. And `PRAGMA foreign_keys` is a NO-OP inside a transaction, so a
   * migration file can't turn it off for itself: the runner has to do it out here,
   * around the BEGIN. Hence the flag rather than a line of SQL.
   */
  foreignKeysOff?: boolean;
}

const MIGRATIONS: Migration[] = [
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
  { name: '013_assignment_due_time.sql', sql: migration013 },
  { name: '014_completed_at.sql', sql: migration014 },
  { name: '015_indexes.sql', sql: migration015 },
  // Rebuilds assignments + tasks; see Migration.foreignKeysOff for why the flag is
  // mandatory here rather than a PRAGMA line inside the file.
  { name: '016_status_checks.sql', sql: migration016, foreignKeysOff: true },
];

/**
 * Which migrations haven't run yet, in order.
 *
 * Split out from the runner because startup asks the same question one step
 * earlier — "is this launch about to change the schema?" — to decide whether to
 * take a pre-upgrade backup. Creating the bookkeeping table is part of the
 * answer: on a database from before the table existed, "nothing has run" is only
 * true once there's somewhere for that to be recorded.
 */
function pendingMigrations(database: DatabaseSync): Migration[] {
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

  return MIGRATIONS.filter(migration => !ran.has(migration.name));
}

/**
 * Apply every pending migration, each inside its own transaction.
 *
 * Why the transaction is load-bearing: `exec()` runs a multi-statement file one
 * statement at a time with autocommit on. Without a transaction, a file that fails
 * halfway leaves its earlier statements committed while the `_migrations` row is
 * never written — so the next launch sees the migration as pending, replays it from
 * the top, and dies on `table already exists` / `duplicate column name`. That state
 * is permanent: the app can never start again, and the user has no way in to reach
 * their data. Most of our migrations are bare `ALTER TABLE ADD COLUMN`, which SQLite
 * has no `IF NOT EXISTS` form for, so they cannot be made replay-safe individually.
 *
 * Binding the schema change and its bookkeeping row into one transaction makes each
 * migration all-or-nothing: it either applies and is recorded, or the database is
 * left exactly as it was and startup fails loudly having damaged nothing.
 *
 * (SQLite supports transactional DDL, so CREATE/ALTER really do roll back here. That
 * is not true of every database — MySQL, for instance, commits DDL implicitly.)
 */
function runMigrations(database: DatabaseSync): void {
  for (const { name, sql, foreignKeysOff } of pendingMigrations(database)) {
    // Must be toggled outside the transaction — see Migration.foreignKeysOff.
    if (foreignKeysOff) database.exec('PRAGMA foreign_keys = OFF');

    database.exec('BEGIN');
    try {
      database.exec(sql);

      // With enforcement off we've been running unchecked, so verify before committing
      // that the rebuild didn't leave an orphan behind. This is the safety net that
      // makes turning foreign keys off acceptable at all.
      if (foreignKeysOff) {
        const violations = database.prepare('PRAGMA foreign_key_check').all();
        if (violations.length > 0) {
          throw new Error(
            `left ${violations.length} orphaned row(s) behind — foreign_key_check failed`,
          );
        }
      }

      database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
      database.exec('COMMIT');
    } catch (err) {
      // SQLite auto-rolls-back on some errors, in which case ROLLBACK itself throws
      // ("no transaction is active"). Swallow that so the *original* failure is what
      // reaches the caller — it's the one that says what actually went wrong.
      try { database.exec('ROLLBACK'); } catch { /* already rolled back by SQLite */ }
      throw new Error(
        `Migration ${name} failed and was rolled back — your data is unchanged. ` +
          `Cause: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    } finally {
      // Restore enforcement on every path, including the throw above. Leaving it off
      // would silently disable every cascade and FK check for the rest of the session.
      if (foreignKeysOff) database.exec('PRAGMA foreign_keys = ON');
    }
    console.log(`[DB] Migration applied: ${name}`);
  }
}
