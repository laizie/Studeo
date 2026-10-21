import { describe, it, expect } from 'vitest';
import { generateRepeats, MAX_REPEAT_OCCURRENCES, shiftDate, shiftSkipReason } from '../repeat';

describe('generateRepeats', () => {
  it('generates weekly occurrences up to and including the until date', () => {
    const out = generateRepeats('Homework 1', '2026-01-16', '2026-02-06', 1);
    expect(out).toEqual([
      { name: 'Homework 2', dueDate: '2026-01-23' },
      { name: 'Homework 3', dueDate: '2026-01-30' },
      { name: 'Homework 4', dueDate: '2026-02-06' },
    ]);
  });

  it('stops before an until date that is not on the cycle', () => {
    const out = generateRepeats('Quiz 1', '2026-01-16', '2026-01-29', 1);
    expect(out).toEqual([{ name: 'Quiz 2', dueDate: '2026-01-23' }]);
  });

  it('supports every-2-weeks intervals', () => {
    const out = generateRepeats('Lab 1', '2026-01-05', '2026-02-02', 2);
    expect(out).toEqual([
      { name: 'Lab 2', dueDate: '2026-01-19' },
      { name: 'Lab 3', dueDate: '2026-02-02' },
    ]);
  });

  it('continues numbering from a trailing number greater than 1', () => {
    const out = generateRepeats('HW 7', '2026-03-02', '2026-03-16', 1);
    expect(out.map(o => o.name)).toEqual(['HW 8', 'HW 9']);
  });

  it('appends numbers starting at 2 when the name has no trailing number', () => {
    const out = generateRepeats('Reading quiz', '2026-01-12', '2026-01-26', 1);
    expect(out.map(o => o.name)).toEqual(['Reading quiz 2', 'Reading quiz 3']);
  });

  it('crosses month boundaries correctly', () => {
    const out = generateRepeats('Homework 1', '2026-01-26', '2026-02-09', 1);
    expect(out.map(o => o.dueDate)).toEqual(['2026-02-02', '2026-02-09']);
  });

  it('crosses the spring DST change without shifting the date', () => {
    // US DST starts March 8, 2026.
    const out = generateRepeats('HW 1', '2026-03-06', '2026-03-13', 1);
    expect(out).toEqual([{ name: 'HW 2', dueDate: '2026-03-13' }]);
  });

  it('crosses year boundaries correctly', () => {
    const out = generateRepeats('PS 1', '2026-12-28', '2027-01-11', 1);
    expect(out.map(o => o.dueDate)).toEqual(['2027-01-04', '2027-01-11']);
  });

  it('returns empty when until is before the start date', () => {
    expect(generateRepeats('HW 1', '2026-02-01', '2026-01-01', 1)).toEqual([]);
  });

  it('returns empty when until equals the start date', () => {
    expect(generateRepeats('HW 1', '2026-02-01', '2026-02-01', 1)).toEqual([]);
  });

  it('returns empty for blank name or missing dates', () => {
    expect(generateRepeats('', '2026-01-01', '2026-05-01', 1)).toEqual([]);
    expect(generateRepeats('HW 1', '', '2026-05-01', 1)).toEqual([]);
    expect(generateRepeats('HW 1', '2026-01-01', '', 1)).toEqual([]);
  });

  it('returns empty for a non-positive or fractional interval', () => {
    expect(generateRepeats('HW 1', '2026-01-01', '2026-05-01', 0)).toEqual([]);
    expect(generateRepeats('HW 1', '2026-01-01', '2026-05-01', -1)).toEqual([]);
    expect(generateRepeats('HW 1', '2026-01-01', '2026-05-01', 1.5)).toEqual([]);
  });

  it('caps runaway series at MAX_REPEAT_OCCURRENCES', () => {
    const out = generateRepeats('HW 1', '2026-01-01', '2099-01-01', 1);
    expect(out.length).toBe(MAX_REPEAT_OCCURRENCES);
  });
});

describe('shiftDate', () => {
  it('moves a date forward by whole days', () => {
    expect(shiftDate('2026-03-05', 7)).toBe('2026-03-12');
  });

  it('moves a date backward for a negative shift', () => {
    expect(shiftDate('2026-03-12', -7)).toBe('2026-03-05');
  });

  it('rolls over a month boundary', () => {
    expect(shiftDate('2026-01-28', 7)).toBe('2026-02-04');
  });

  it('rolls over a year boundary', () => {
    expect(shiftDate('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('handles a leap day', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  // The DST cases are why this goes through local-midnight Dates instead of
  // UTC arithmetic: a naive +7*86400e3 lands on the 23- or 25-hour day and
  // comes back off by one.
  it('keeps the same weekday across a spring-forward boundary', () => {
    // US DST starts 2026-03-08. Sunday the 1st + 7 is still a Sunday.
    expect(shiftDate('2026-03-01', 7)).toBe('2026-03-08');
    expect(shiftDate('2026-03-06', 7)).toBe('2026-03-13');
  });

  it('keeps the same weekday across a fall-back boundary', () => {
    // US DST ends 2026-11-01.
    expect(shiftDate('2026-10-30', 7)).toBe('2026-11-06');
  });

  it('is a no-op for a zero shift', () => {
    expect(shiftDate('2026-03-05', 0)).toBe('2026-03-05');
  });

  it('returns empty for unusable input rather than throwing', () => {
    expect(shiftDate('', 7)).toBe('');
    expect(shiftDate('not-a-date', 7)).toBe('');
    expect(shiftDate('2026-03-05', 1.5)).toBe('');
  });
});

describe('shiftSkipReason', () => {
  it('leaves an untouched occurrence alone', () => {
    expect(shiftSkipReason({ status: 'not_started', score: null })).toBeNull();
    expect(shiftSkipReason({ status: 'in_progress', score: null })).toBeNull();
  });

  it('protects a completed occurrence', () => {
    expect(shiftSkipReason({ status: 'completed', score: null })).toBe('completed');
  });

  it('protects a graded occurrence even if it was never marked done', () => {
    expect(shiftSkipReason({ status: 'not_started', score: 18 })).toBe('graded');
  });

  it('reports completion first when an occurrence is both', () => {
    expect(shiftSkipReason({ status: 'completed', score: 18 })).toBe('completed');
  });

  it('treats a zero score as a real grade', () => {
    expect(shiftSkipReason({ status: 'in_progress', score: 0 })).toBe('graded');
  });
});
