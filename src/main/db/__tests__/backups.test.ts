import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestDb } from './helpers';

// The module under test asks Electron where the user-data folder is. Point that at a
// throwaway temp directory so the real backup/prune code runs against a real disk.
// `getPath` reads the variable lazily (only when a backup runs), which is what makes
// this safe despite vi.mock being hoisted above the declaration.
let userDataDir = '';
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }));

import { runDailyBackup, runPreUpgradeBackup, backupsDir } from '../backups';

/** Stand-in for connection.ts's snapshotInto — writes a file, like VACUUM INTO would. */
const fakeSnapshot = (target: string) => writeFileSync(target, 'snapshot');

const at = (day: number, hour = 12) => new Date(2026, 7, day, hour, 0, 0);

function backupNames(): string[] {
  return readdirSync(backupsDir()).sort();
}

beforeEach(() => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'studeo-backup-test-'));
});

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

describe('runDailyBackup', () => {
  it('creates the backups folder and writes the first snapshot', () => {
    runDailyBackup(fakeSnapshot, at(13));
    expect(backupNames()).toEqual(['studeo-daily-2026-08-13_120000.db']);
  });

  it('takes at most one snapshot per calendar day', () => {
    // Three launches in one day — a completely normal amount of opening and quitting.
    runDailyBackup(fakeSnapshot, at(13, 9));
    runDailyBackup(fakeSnapshot, at(13, 14));
    runDailyBackup(fakeSnapshot, at(13, 22));
    expect(backupNames()).toEqual(['studeo-daily-2026-08-13_090000.db']);

    // Next day, a new one.
    runDailyBackup(fakeSnapshot, at(14, 8));
    expect(backupNames()).toHaveLength(2);
  });

  it('keeps a rolling week and deletes the oldest beyond it', () => {
    for (let day = 1; day <= 10; day += 1) {
      runDailyBackup(fakeSnapshot, at(day));
    }
    const names = backupNames();
    expect(names).toHaveLength(7);
    // Days 1–3 aged out; 4–10 remain.
    expect(names[0]).toBe('studeo-daily-2026-08-04_120000.db');
    expect(names[6]).toBe('studeo-daily-2026-08-10_120000.db');
  });
});

describe('runPreUpgradeBackup', () => {
  it('writes one per call — each upgrade is its own event, not once a day', () => {
    runPreUpgradeBackup(fakeSnapshot, at(13, 9));
    runPreUpgradeBackup(fakeSnapshot, at(13, 10));
    expect(backupNames()).toEqual([
      'studeo-preupgrade-2026-08-13_090000.db',
      'studeo-preupgrade-2026-08-13_100000.db',
    ]);
  });

  it('survives a week of daily snapshots — the pools rotate independently', () => {
    runPreUpgradeBackup(fakeSnapshot, at(1, 8));
    for (let day = 1; day <= 10; day += 1) {
      runDailyBackup(fakeSnapshot, at(day));
    }
    // This is the file that matters most after a bad upgrade, and it's older than
    // every daily snapshot left on disk. A single shared pool would have evicted it.
    expect(existsSync(path.join(backupsDir(), 'studeo-preupgrade-2026-08-01_080000.db'))).toBe(true);
  });
});

describe('backup failures', () => {
  it('never throws — a launch must not fail because a snapshot could not be written', () => {
    const failing = () => { throw new Error('disk full'); };
    expect(() => runDailyBackup(failing, at(13))).not.toThrow();
    expect(() => runPreUpgradeBackup(failing, at(13))).not.toThrow();
    expect(backupNames()).toEqual([]);
  });

  it('leaves files it did not write alone when pruning', () => {
    mkdirSync(backupsDir(), { recursive: true });
    const mine = path.join(backupsDir(), 'my-own-copy.db');
    writeFileSync(mine, 'keep me');

    for (let day = 1; day <= 10; day += 1) {
      runDailyBackup(fakeSnapshot, at(day));
    }
    expect(existsSync(mine)).toBe(true);
  });
});

describe('the real snapshot mechanism', () => {
  it('produces a readable copy of the database through VACUUM INTO', () => {
    const db = createTestDb();
    db.prepare("INSERT INTO terms (id, name, start_date, end_date) VALUES ('t1', 'Fall 2026', '2026-08-17', '2026-12-11')").run();

    // The same call shape connection.ts passes in: a real VACUUM INTO, not a stub.
    runDailyBackup(target => { db.prepare('VACUUM INTO ?').run(target); }, at(13));

    const copyPath = path.join(backupsDir(), 'studeo-daily-2026-08-13_120000.db');
    expect(existsSync(copyPath)).toBe(true);

    // Open the snapshot as its own database: the data has to actually be in there,
    // which is the whole promise of the feature.
    const copy = new DatabaseSync(copyPath, { readOnly: true });
    const rows = copy.prepare('SELECT name FROM terms').all() as { name: string }[];
    expect(rows).toEqual([{ name: 'Fall 2026' }]);
    copy.close();
    db.close();
  });
});
