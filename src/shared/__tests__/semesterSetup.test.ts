import { describe, it, expect } from 'vitest';
import { suggestTermName, timeRangeValid, expandWeekdayMeetings } from '../semesterSetup';

// ── suggestTermName ─────────────────────────────────────────────────────────

describe('suggestTermName', () => {
  it('suggests the coming Fall during the summer setup window (Jul–Oct)', () => {
    expect(suggestTermName(new Date(2026, 6, 2))).toBe('Fall 2026');  // July
    expect(suggestTermName(new Date(2026, 9, 15))).toBe('Fall 2026'); // October
  });

  it('rolls to next year\'s Spring in Nov–Dec', () => {
    expect(suggestTermName(new Date(2026, 10, 1))).toBe('Spring 2027'); // November
    expect(suggestTermName(new Date(2026, 11, 20))).toBe('Spring 2027'); // December
  });

  it('suggests this Spring in Jan–Mar', () => {
    expect(suggestTermName(new Date(2026, 0, 5))).toBe('Spring 2026'); // January
    expect(suggestTermName(new Date(2026, 2, 30))).toBe('Spring 2026'); // March
  });

  it('suggests Summer in Apr–Jun', () => {
    expect(suggestTermName(new Date(2026, 3, 1))).toBe('Summer 2026'); // April
    expect(suggestTermName(new Date(2026, 5, 30))).toBe('Summer 2026'); // June
  });
});

// ── timeRangeValid ──────────────────────────────────────────────────────────

describe('timeRangeValid', () => {
  it('accepts a start before the end', () => {
    expect(timeRangeValid('09:00', '10:15')).toBe(true);
  });

  it('rejects an end equal to or before the start', () => {
    expect(timeRangeValid('10:00', '10:00')).toBe(false);
    expect(timeRangeValid('11:00', '10:00')).toBe(false);
  });

  it('rejects malformed times', () => {
    expect(timeRangeValid('9:00', '10:00')).toBe(false);
    expect(timeRangeValid('', '10:00')).toBe(false);
  });
});

// ── expandWeekdayMeetings ───────────────────────────────────────────────────

describe('expandWeekdayMeetings', () => {
  it('creates one meeting input per selected day', () => {
    const out = expandWeekdayMeetings('course-1', [1, 3, 5], '09:00', '09:50');
    expect(out).toHaveLength(3);
    expect(out.map(m => m.dayOfWeek)).toEqual([1, 3, 5]);
    expect(out.every(m => m.courseId === 'course-1' && m.startTime === '09:00' && m.endTime === '09:50')).toBe(true);
  });

  it('de-duplicates and sorts days Sunday-first', () => {
    const out = expandWeekdayMeetings('c', [5, 1, 5, 3], '13:00', '14:00');
    expect(out.map(m => m.dayOfWeek)).toEqual([1, 3, 5]);
  });

  it('returns an empty array when no days are selected', () => {
    expect(expandWeekdayMeetings('c', [], '09:00', '10:00')).toEqual([]);
  });

  it('puts the room on every day of the selection', () => {
    const out = expandWeekdayMeetings('c', [1, 3], '09:00', '09:50', 'Hall 204');
    expect(out.map(m => m.location)).toEqual(['Hall 204', 'Hall 204']);
  });

  it('leaves the location off when no room is given, so the course building applies', () => {
    const out = expandWeekdayMeetings('c', [1], '09:00', '09:50');
    expect(out[0].location).toBeUndefined();
  });

  it('treats a whitespace-only room as no room', () => {
    const out = expandWeekdayMeetings('c', [1], '09:00', '09:50', '   ');
    expect(out[0].location).toBeUndefined();
  });

  it('trims a room before storing it', () => {
    const out = expandWeekdayMeetings('c', [1], '09:00', '09:50', '  Lab B  ');
    expect(out[0].location).toBe('Lab B');
  });
});
