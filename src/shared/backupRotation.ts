/**
 * Naming and rotation rules for Studeo's automatic backups.
 *
 * The app keeps its own rolling snapshots of the database in a `backups/` folder
 * beside `studeo.db`. Two kinds, kept in separate pools:
 *
 *   - `daily`     — one snapshot per calendar day, taken at launch. The everyday
 *                   safety net: "I deleted a course on Tuesday and want it back."
 *   - `preupgrade` — taken immediately before a pending migration changes the
 *                   schema. Migrations are transactional, so a *failed* one is
 *                   already safe; this guards the other case — a migration that
 *                   succeeds while transforming data wrongly, which no rollback
 *                   catches because SQLite never saw an error.
 *
 * Keeping the two pools separate matters: a run of daily snapshots must never be
 * able to push out the one snapshot taken just before an upgrade, which is the
 * most valuable file in the folder.
 *
 * Everything here is pure string work — no `fs`, no Electron — so the rotation
 * rules can be unit-tested without touching a disk. The file I/O that uses them
 * lives in `main/db/backups.ts`.
 */

export type BackupKind = 'daily' | 'preupgrade';

/** How many snapshots of each kind to keep before the oldest are deleted. */
export const BACKUPS_TO_KEEP: Record<BackupKind, number> = {
  daily: 7,
  preupgrade: 3,
};

// studeo-daily-2026-08-13_140502.db
//         ^kind ^day        ^time
const NAME_PATTERN = /^studeo-(daily|preupgrade)-(\d{4}-\d{2}-\d{2})_(\d{6})\.db$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * The local calendar date as YYYY-MM-DD.
 *
 * Local, not UTC: `toISOString()` would roll the day over at UTC midnight (8 PM
 * Eastern), so an evening launch would be filed under tomorrow. The same reason
 * `reminders.ts` has its own local date key.
 */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The filename a snapshot taken at `date` should be given. */
export function backupFileName(kind: BackupKind, date: Date): string {
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `studeo-${kind}-${localDayKey(date)}_${time}.db`;
}

/**
 * Read a filename back into its parts, or null if it isn't one of ours.
 *
 * Returning null for anything unrecognized is what makes the folder safe to
 * prune: a file we can't parse is a file we never delete.
 */
export function parseBackupFileName(
  name: string,
): { kind: BackupKind; day: string; stamp: string } | null {
  const match = NAME_PATTERN.exec(name);
  if (!match) return null;
  const [, kind, day, time] = match;
  // The stamp sorts correctly as a plain string: fixed width and zero-padded.
  return { kind: kind as BackupKind, day, stamp: `${day}_${time}` };
}

/** Whether a snapshot of this kind was already taken on the given local day. */
export function hasBackupForDay(names: string[], kind: BackupKind, day: string): boolean {
  return names.some(name => {
    const parsed = parseBackupFileName(name);
    return parsed !== null && parsed.kind === kind && parsed.day === day;
  });
}

/**
 * Which files of this kind are now surplus — newest `keep` survive, the rest go.
 *
 * Only files of the requested kind are ever considered, so pruning the daily pool
 * cannot touch a pre-upgrade snapshot (or anything else a user has dropped in the
 * folder).
 */
export function selectExpiredBackups(
  names: string[],
  kind: BackupKind,
  keep: number = BACKUPS_TO_KEEP[kind],
): string[] {
  const ours: { name: string; stamp: string }[] = [];
  for (const name of names) {
    const parsed = parseBackupFileName(name);
    if (parsed && parsed.kind === kind) ours.push({ name, stamp: parsed.stamp });
  }
  return ours
    .sort((a, b) => b.stamp.localeCompare(a.stamp)) // newest first
    .slice(Math.max(keep, 0))
    .map(entry => entry.name);
}
