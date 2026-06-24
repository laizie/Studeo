import { describe, it, expect } from 'vitest';
import type { StudySession } from '../types';
import {
  focusMinutesByDay,
  totalFocusMinutes,
  focusMinutesSince,
  minutesToLevel,
  currentStreak,
  buildHeatmap,
  localDayKey,
} from '../studyStats';

// Build a focus session at a local date/time for a given number of minutes.
function focus(dateStr: string, minutes: number): StudySession {
  return {
    id: `${dateStr}-${minutes}`,
    started_at: new Date(dateStr).toISOString(),
    duration_seconds: minutes * 60,
    kind: 'focus',
  } as StudySession;
}

function breakSession(dateStr: string, minutes: number): StudySession {
  return { ...focus(dateStr, minutes), kind: 'short_break' } as StudySession;
}

describe('focusMinutesByDay', () => {
  it('sums focus minutes per local day and ignores breaks', () => {
    const sessions = [
      focus('2026-06-20T09:00', 25),
      focus('2026-06-20T14:00', 50),
      breakSession('2026-06-20T10:00', 5),
      focus('2026-06-21T09:00', 30),
    ];
    const byDay = focusMinutesByDay(sessions);
    expect(byDay.get('2026-06-20')).toBe(75);
    expect(byDay.get('2026-06-21')).toBe(30);
    expect(byDay.size).toBe(2);
  });
});

describe('totalFocusMinutes / focusMinutesSince', () => {
  const sessions = [focus('2026-06-18T09:00', 25), focus('2026-06-22T09:00', 50), breakSession('2026-06-22T10:00', 5)];

  it('totals only focus minutes', () => {
    expect(totalFocusMinutes(sessions)).toBe(75);
  });

  it('counts minutes on or after the cutoff', () => {
    expect(focusMinutesSince(sessions, new Date('2026-06-20T00:00'))).toBe(50);
  });
});

describe('minutesToLevel', () => {
  it('maps minutes to 0–4 buckets', () => {
    expect(minutesToLevel(0)).toBe(0);
    expect(minutesToLevel(0.5)).toBe(0);
    expect(minutesToLevel(20)).toBe(1);
    expect(minutesToLevel(45)).toBe(2);
    expect(minutesToLevel(90)).toBe(3);
    expect(minutesToLevel(200)).toBe(4);
  });
});

describe('currentStreak', () => {
  it('counts consecutive days back from today', () => {
    const now = new Date('2026-06-24T18:00');
    const sessions = [
      focus('2026-06-24T09:00', 25),
      focus('2026-06-23T09:00', 25),
      focus('2026-06-22T09:00', 25),
      // gap on the 21st
      focus('2026-06-20T09:00', 25),
    ];
    expect(currentStreak(sessions, now)).toBe(3);
  });

  it('keeps a streak alive through yesterday when today is empty', () => {
    const now = new Date('2026-06-24T08:00');
    const sessions = [focus('2026-06-23T09:00', 25), focus('2026-06-22T09:00', 25)];
    expect(currentStreak(sessions, now)).toBe(2);
  });

  it('is zero with no recent sessions', () => {
    const now = new Date('2026-06-24T08:00');
    expect(currentStreak([focus('2026-06-01T09:00', 25)], now)).toBe(0);
  });
});

describe('buildHeatmap', () => {
  const now = new Date('2026-06-24T12:00'); // a Wednesday

  it('returns `weeks` columns of 7 days each, Sun→Sat', () => {
    const grid = buildHeatmap([], 4, now);
    expect(grid).toHaveLength(4);
    for (const col of grid) {
      expect(col).toHaveLength(7);
      expect(col[0].date.getDay()).toBe(0); // Sunday
      expect(col[6].date.getDay()).toBe(6); // Saturday
    }
  });

  it('places today in the last column and marks later days as future', () => {
    const grid = buildHeatmap([], 4, now);
    const lastWeek = grid[grid.length - 1];
    const todayKey = localDayKey(now);
    const todayCell = lastWeek.find(c => c.key === todayKey);
    expect(todayCell).toBeDefined();
    expect(todayCell!.future).toBe(false);
    // Wednesday → Thu/Fri/Sat of this week are in the future.
    expect(lastWeek.filter(c => c.future)).toHaveLength(3);
  });

  it('fills minutes and levels from sessions', () => {
    const grid = buildHeatmap([focus('2026-06-24T09:00', 90)], 4, now);
    const cell = grid.flat().find(c => c.key === '2026-06-24')!;
    expect(cell.minutes).toBe(90);
    expect(cell.level).toBe(3);
  });
});
