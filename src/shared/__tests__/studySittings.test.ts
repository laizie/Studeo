import { describe, it, expect } from 'vitest';
import {
  groupIntoSittings,
  sittingsByDay,
  sittingIntentions,
  lastReflection,
  SITTING_GAP_MS,
} from '../studySittings';
import type { StudySession } from '../types';

// Build a focus block starting at a local wall-clock time. Local (not UTC) because
// sittings are a human "at the desk" concept and day bucketing is local.
function block(
  id: string,
  local: string,
  minutes: number,
  extra: Partial<StudySession> = {},
): StudySession {
  return {
    id,
    started_at:       new Date(local).toISOString(),
    duration_seconds: minutes * 60,
    kind:             'focus',
    course_id:        null,
    intention:        null,
    reflection:       null,
    ...extra,
  };
}

describe('groupIntoSittings', () => {
  it('returns nothing for no sessions', () => {
    expect(groupIntoSittings([])).toEqual([]);
  });

  it('merges back-to-back Pomodoro blocks into one sitting', () => {
    // The bug this whole module exists for: 4×25 min with 5 min breaks should read
    // as one ~2 hour afternoon, not four identical 25-minute sessions.
    const sessions = [
      block('a', '2026-03-02T13:00:00', 25),
      block('b', '2026-03-02T13:30:00', 25),
      block('c', '2026-03-02T14:00:00', 25),
      block('d', '2026-03-02T14:30:00', 25),
    ];

    const [sitting, ...rest] = groupIntoSittings(sessions);

    expect(rest).toHaveLength(0);
    expect(sitting.blocks).toHaveLength(4);
    expect(sitting.focusSeconds).toBe(100 * 60);
    expect(sitting.startedAt).toEqual(new Date('2026-03-02T13:00:00'));
    expect(sitting.endedAt).toEqual(new Date('2026-03-02T14:55:00'));
  });

  it('anchors the sitting on the first block, for a stable notes thread', () => {
    const sessions = [
      block('first',  '2026-03-02T13:00:00', 25),
      block('second', '2026-03-02T13:30:00', 25),
    ];
    expect(groupIntoSittings(sessions)[0].id).toBe('first');
  });

  it('counts only focus time, not the breaks inside the sitting', () => {
    const sessions = [
      block('a', '2026-03-02T09:00:00', 50),
      block('b', '2026-03-02T10:00:00', 50), // 10 min break between them
    ];
    const [sitting] = groupIntoSittings(sessions);

    expect(sitting.focusSeconds).toBe(100 * 60);   // worked
    expect(sitting.elapsedSeconds).toBe(110 * 60); // at the desk
  });

  it('starts a new sitting once the gap passes an hour', () => {
    const sessions = [
      block('morning',   '2026-03-02T09:00:00', 25),
      block('afternoon', '2026-03-02T11:00:00', 25), // 1h35m later
    ];
    expect(groupIntoSittings(sessions)).toHaveLength(2);
  });

  it('treats a gap of exactly an hour as the same sitting', () => {
    // The rule is "paused for up to an hour", so the boundary itself still counts.
    const sessions = [
      block('a', '2026-03-02T09:00:00', 25),
      block('b', '2026-03-02T10:25:00', 25), // ends 09:25, +60 min exactly
    ];
    expect(groupIntoSittings(sessions)).toHaveLength(1);
  });

  it('splits one second past the gap', () => {
    const sessions = [
      block('a', '2026-03-02T09:00:00', 25),
      block('b', new Date(new Date('2026-03-02T09:25:00').getTime() + SITTING_GAP_MS + 1000).toString(), 25),
    ];
    expect(groupIntoSittings(sessions)).toHaveLength(2);
  });

  it('ignores break rows entirely', () => {
    const sessions = [
      block('a', '2026-03-02T13:00:00', 25),
      block('brk', '2026-03-02T13:25:00', 5, { kind: 'short_break' }),
      block('b', '2026-03-02T13:30:00', 25),
    ];
    const [sitting] = groupIntoSittings(sessions);

    expect(sitting.blocks.map((b) => b.id)).toEqual(['a', 'b']);
    expect(sitting.focusSeconds).toBe(50 * 60);
  });

  it('folds blocks that arrive out of order', () => {
    // listStudySessions() returns newest-first, so the input is reverse-sorted in
    // practice — grouping must not depend on the caller sorting first.
    const sessions = [
      block('c', '2026-03-02T14:00:00', 25),
      block('a', '2026-03-02T13:00:00', 25),
      block('b', '2026-03-02T13:30:00', 25),
    ];
    const [sitting] = groupIntoSittings(sessions);

    expect(sitting.blocks.map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(sitting.id).toBe('a');
  });

  it('keeps a late-night sitting whole across midnight', () => {
    const sessions = [
      block('a', '2026-03-02T23:30:00', 25),
      block('b', '2026-03-03T00:05:00', 25),
    ];
    expect(groupIntoSittings(sessions)).toHaveLength(1);
  });

  it('never lets a shorter overlapping block pull the end backwards', () => {
    const sessions = [
      block('long',  '2026-03-02T13:00:00', 60),
      block('short', '2026-03-02T13:10:00', 5), // ends well before `long` does
    ];
    expect(groupIntoSittings(sessions)[0].endedAt).toEqual(new Date('2026-03-02T14:00:00'));
  });

  it('honours a custom gap', () => {
    const sessions = [
      block('a', '2026-03-02T09:00:00', 25),
      block('b', '2026-03-02T09:40:00', 25), // 15 min gap
    ];
    expect(groupIntoSittings(sessions, 10 * 60 * 1000)).toHaveLength(2);
    expect(groupIntoSittings(sessions, 20 * 60 * 1000)).toHaveLength(1);
  });
});

describe('sittingsByDay', () => {
  it('buckets by local day, newest first', () => {
    const sittings = groupIntoSittings([
      block('mon', '2026-03-02T13:00:00', 25),
      block('tue', '2026-03-03T13:00:00', 50),
    ]);
    const days = sittingsByDay(sittings);

    expect(days.map((d) => d.key)).toEqual(['2026-03-03', '2026-03-02']);
    expect(days[0].focusSeconds).toBe(50 * 60);
  });

  it('sums every sitting in a day', () => {
    const sittings = groupIntoSittings([
      block('morning',   '2026-03-02T09:00:00', 25),
      block('afternoon', '2026-03-02T15:00:00', 50),
    ]);
    const [day] = sittingsByDay(sittings);

    expect(day.sittings).toHaveLength(2);
    expect(day.focusSeconds).toBe(75 * 60);
  });

  it('orders sittings within a day newest first', () => {
    const sittings = groupIntoSittings([
      block('morning',   '2026-03-02T09:00:00', 25),
      block('afternoon', '2026-03-02T15:00:00', 25),
    ]);
    expect(sittingsByDay(sittings)[0].sittings.map((s) => s.id)).toEqual(['afternoon', 'morning']);
  });

  it('files a sitting that crossed midnight under the day it began', () => {
    const sittings = groupIntoSittings([
      block('a', '2026-03-02T23:30:00', 25),
      block('b', '2026-03-03T00:05:00', 25),
    ]);
    expect(sittingsByDay(sittings).map((d) => d.key)).toEqual(['2026-03-02']);
  });
});

describe('sittingIntentions', () => {
  it('dedupes repeated intentions, keeping order', () => {
    const [sitting] = groupIntoSittings([
      block('a', '2026-03-02T13:00:00', 25, { intention: 'essay outline' }),
      block('b', '2026-03-02T13:30:00', 25, { intention: 'essay outline' }),
      block('c', '2026-03-02T14:00:00', 25, { intention: 'citations' }),
    ]);
    expect(sittingIntentions(sitting)).toEqual(['essay outline', 'citations']);
  });

  it('skips blank and missing intentions', () => {
    const [sitting] = groupIntoSittings([
      block('a', '2026-03-02T13:00:00', 25, { intention: '   ' }),
      block('b', '2026-03-02T13:30:00', 25),
    ]);
    expect(sittingIntentions(sitting)).toEqual([]);
  });
});

describe('lastReflection', () => {
  it('takes the final reflection of the sitting', () => {
    const [sitting] = groupIntoSittings([
      block('a', '2026-03-02T13:00:00', 25, { reflection: 'slow start' }),
      block('b', '2026-03-02T13:30:00', 25, { reflection: 'found my rhythm' }),
    ]);
    expect(lastReflection(sitting)).toBe('found my rhythm');
  });

  it('falls back to an earlier one when the last block has none', () => {
    const [sitting] = groupIntoSittings([
      block('a', '2026-03-02T13:00:00', 25, { reflection: 'slow start' }),
      block('b', '2026-03-02T13:30:00', 25),
    ]);
    expect(lastReflection(sitting)).toBe('slow start');
  });

  it('returns null when nothing was written', () => {
    const [sitting] = groupIntoSittings([block('a', '2026-03-02T13:00:00', 25)]);
    expect(lastReflection(sitting)).toBeNull();
  });
});
