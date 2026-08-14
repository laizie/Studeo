import { describe, it, expect } from 'vitest';
import {
  backupFileName,
  parseBackupFileName,
  hasBackupForDay,
  selectExpiredBackups,
  localDayKey,
} from '../backupRotation';

describe('backupFileName / parseBackupFileName', () => {
  it('round-trips a name through its parts', () => {
    const name = backupFileName('daily', new Date(2026, 7, 13, 14, 5, 2));
    expect(name).toBe('studeo-daily-2026-08-13_140502.db');
    expect(parseBackupFileName(name)).toEqual({
      kind: 'daily',
      day: '2026-08-13',
      stamp: '2026-08-13_140502',
    });
  });

  it('zero-pads every field so names sort chronologically as strings', () => {
    const early = backupFileName('daily', new Date(2026, 0, 2, 3, 4, 5));
    const later = backupFileName('daily', new Date(2026, 0, 2, 13, 4, 5));
    expect(early).toBe('studeo-daily-2026-01-02_030405.db');
    expect(early < later).toBe(true);
  });

  it('uses the local day, not UTC — an evening snapshot stays on today', () => {
    // 9 PM Eastern on Aug 13 is already Aug 14 in UTC. Under toISOString() this
    // snapshot would be filed under the wrong day and the once-a-day check would
    // take a second one at midnight.
    const evening = new Date(2026, 7, 13, 21, 30, 0);
    expect(localDayKey(evening)).toBe('2026-08-13');
  });

  it('returns null for anything that is not one of our backups', () => {
    for (const name of [
      'studeo.db',
      'studeo-pre-restore-2026-08-13T14-05-02.db',
      'studeo-daily-2026-08-13.db',       // no time component
      'studeo-weekly-2026-08-13_140502.db', // unknown kind
      'notes.txt',
      '',
    ]) {
      expect(parseBackupFileName(name)).toBeNull();
    }
  });
});

describe('hasBackupForDay', () => {
  const names = [
    'studeo-daily-2026-08-12_090000.db',
    'studeo-preupgrade-2026-08-13_080000.db',
  ];

  it('is true only for a matching kind and day', () => {
    expect(hasBackupForDay(names, 'daily', '2026-08-12')).toBe(true);
    expect(hasBackupForDay(names, 'daily', '2026-08-13')).toBe(false);
    expect(hasBackupForDay(names, 'preupgrade', '2026-08-13')).toBe(true);
  });

  it('ignores unrelated files in the folder', () => {
    expect(hasBackupForDay(['studeo.db', 'README'], 'daily', '2026-08-13')).toBe(false);
  });
});

describe('selectExpiredBackups', () => {
  const daily = (day: string) => `studeo-daily-2026-08-${day}_120000.db`;

  it('keeps the newest N and returns the rest', () => {
    const names = ['10', '11', '12', '13', '14'].map(daily);
    expect(selectExpiredBackups(names, 'daily', 3)).toEqual([daily('11'), daily('10')]);
  });

  it('returns nothing while the pool is under the limit', () => {
    expect(selectExpiredBackups([daily('10'), daily('11')], 'daily', 7)).toEqual([]);
  });

  it('orders by timestamp regardless of the order it reads the folder in', () => {
    // readdirSync order is not guaranteed, so the sort has to do the work.
    const names = [daily('12'), daily('10'), daily('14'), daily('11')];
    expect(selectExpiredBackups(names, 'daily', 2)).toEqual([daily('11'), daily('10')]);
  });

  it('never prunes across kinds — daily rotation cannot evict a pre-upgrade snapshot', () => {
    const names = [
      ...['10', '11', '12', '13'].map(daily),
      'studeo-preupgrade-2026-07-01_090000.db',
      'studeo-preupgrade-2026-06-01_090000.db',
    ];
    const expired = selectExpiredBackups(names, 'daily', 2);
    expect(expired).toEqual([daily('11'), daily('10')]);
    expect(expired.every(name => name.includes('daily'))).toBe(true);
  });

  it('leaves files it cannot parse alone', () => {
    const names = [daily('10'), daily('11'), 'studeo.db', 'my-own-copy.db'];
    expect(selectExpiredBackups(names, 'daily', 0)).toEqual([daily('11'), daily('10')]);
  });
});
