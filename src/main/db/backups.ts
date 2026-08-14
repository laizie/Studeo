import { app } from 'electron';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  backupFileName,
  hasBackupForDay,
  localDayKey,
  selectExpiredBackups,
  type BackupKind,
} from '../../shared/backupRotation';

/**
 * Automatic rolling backups of the database.
 *
 * Studeo already had a manual "Back up now…" button, but a backup you have to
 * remember to take is a backup you don't have. These snapshots happen on their
 * own: one per day at launch, plus one immediately before any schema upgrade.
 *
 * What they cover: everything in `studeo.db` — courses, assignments, tasks,
 * notes, study history, grades. What they don't: note *images*, which live as
 * files under the assets folder. That's deliberate. These snapshots defend
 * against the database going wrong (a bad upgrade, a mistaken bulk delete,
 * corruption); the image files aren't touched by any of that, and copying the
 * whole assets folder seven times over would cost real disk for no added
 * protection. Restoring one of these leaves your images exactly where they are.
 * The manual backup still copies assets alongside the .db — that's the one to
 * put on an external drive, because it's also the one that survives losing this
 * disk, which nothing in this folder does.
 *
 * The rotation rules (naming, once-a-day, which files expire) are pure functions
 * in `shared/backupRotation.ts` and unit-tested there. This module is only the
 * file I/O around them.
 */

/** `userData/backups`, created on first use. */
export function backupsDir(): string {
  return path.join(app.getPath('userData'), 'backups');
}

function listBackupNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return []; // folder doesn't exist yet — same as "no backups"
  }
}

/**
 * Write one snapshot and prune that kind's pool back to its limit.
 *
 * `snapshot` is passed in rather than imported so this module never has to reach
 * into the database connection — it keeps `connection.ts` as the only place that
 * touches `node:sqlite`, and keeps this file trivially readable.
 */
function writeBackup(
  kind: BackupKind,
  snapshot: (targetPath: string) => void,
  now: Date,
): string {
  const dir = backupsDir();
  mkdirSync(dir, { recursive: true });

  const target = path.join(dir, backupFileName(kind, now));
  // VACUUM INTO refuses to write over an existing file. Two launches inside the
  // same second would collide; the existing snapshot is just as good, so keep it.
  if (existsSync(target)) return target;
  snapshot(target);

  for (const expired of selectExpiredBackups(listBackupNames(dir), kind)) {
    rmSync(path.join(dir, expired), { force: true });
  }
  return target;
}

/**
 * Every one of these runs on the startup path, and none of them is worth failing
 * a launch over. A full disk or a read-only folder should cost you the safety
 * net, not the app — so failures are logged and swallowed.
 */
function tryBackup(kind: BackupKind, snapshot: (targetPath: string) => void, now: Date): void {
  try {
    const written = writeBackup(kind, snapshot, now);
    console.log(`[DB] ${kind} backup written:`, written);
  } catch (err) {
    console.error(`[DB] ${kind} backup failed (continuing):`, err);
  }
}

/** The once-a-day snapshot. Called at launch, after migrations have settled. */
export function runDailyBackup(snapshot: (targetPath: string) => void, now = new Date()): void {
  if (hasBackupForDay(listBackupNames(backupsDir()), 'daily', localDayKey(now))) return;
  tryBackup('daily', snapshot, now);
}

/**
 * The snapshot taken just before a pending migration runs.
 *
 * Not rate-limited by day: each upgrade is its own event, and the whole point is
 * to have the exact "before" state of that specific schema change.
 */
export function runPreUpgradeBackup(snapshot: (targetPath: string) => void, now = new Date()): void {
  tryBackup('preupgrade', snapshot, now);
}
