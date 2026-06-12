import { describe, it, expect } from 'vitest';
import { generateRepeats, MAX_REPEAT_OCCURRENCES } from '../repeat';

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
