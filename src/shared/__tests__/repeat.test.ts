import { describe, it, expect } from 'vitest';
import {
  detectSeriesCandidates,
  generateRepeats,
  groupIntoSeries,
  MAX_REPEAT_OCCURRENCES,
  seriesRenames,
  shiftDate,
  shiftSkipReason,
} from '../repeat';
import type { GroupableRow } from '../repeat';

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

describe('groupIntoSeries', () => {
  const row = (
    name: string,
    dueDate: string,
    seriesSeed: string | null = null,
    seriesWeeks: number | null = null,
  ): GroupableRow => ({ name, dueDate, seriesSeed, seriesWeeks, type: 'Homework' });

  it('treats untagged rows as one-offs', () => {
    const out = groupIntoSeries([row('Essay', '2026-03-06'), row('Midterm', '2026-03-13')]);

    expect(out.series).toEqual([]);
    expect(out.singles.map(s => s.name)).toEqual(['Essay', 'Midterm']);
  });

  it('collects rows sharing a tag into one series', () => {
    const out = groupIntoSeries([
      row('Homework 1', '2026-03-06', 'seed-a', 1),
      row('Homework 2', '2026-03-13', 'seed-a', 1),
      row('Homework 3', '2026-03-20', 'seed-a', 1),
    ]);

    expect(out.singles).toEqual([]);
    expect(out.series).toHaveLength(1);
    expect(out.series[0].intervalWeeks).toBe(1);
    expect(out.series[0].occurrences.map(o => o.dueDate)).toEqual([
      '2026-03-06', '2026-03-13', '2026-03-20',
    ]);
  });

  it('keeps separate tags as separate series', () => {
    const out = groupIntoSeries([
      row('Homework 1', '2026-03-06', 'seed-a', 1),
      row('Homework 2', '2026-03-13', 'seed-a', 1),
      row('Lab 1', '2026-03-07', 'seed-b', 2),
      row('Lab 2', '2026-03-21', 'seed-b', 2),
    ]);

    expect(out.series).toHaveLength(2);
    expect(out.series[0].occurrences.map(o => o.name)).toEqual(['Homework 1', 'Homework 2']);
    expect(out.series[1].intervalWeeks).toBe(2);
  });

  it('groups a tag whose rows were split apart in the grid', () => {
    // The user typed an unrelated row into the middle of a generated group.
    const out = groupIntoSeries([
      row('Homework 1', '2026-03-06', 'seed-a', 1),
      row('Reading', '2026-03-09'),
      row('Homework 2', '2026-03-13', 'seed-a', 1),
    ]);

    expect(out.series[0].occurrences.map(o => o.name)).toEqual(['Homework 1', 'Homework 2']);
    expect(out.singles.map(s => s.name)).toEqual(['Reading']);
  });

  it('demotes a group worn down to a single row', () => {
    // Every other occurrence was deleted before saving — what's left is just an
    // assignment, and a series of one is bookkeeping with nothing to book.
    const out = groupIntoSeries([row('Homework 1', '2026-03-06', 'seed-a', 1)]);

    expect(out.series).toEqual([]);
    expect(out.singles.map(s => s.name)).toEqual(['Homework 1']);
  });

  it('keeps edits the user made to generated rows', () => {
    const out = groupIntoSeries([
      row('Homework 1', '2026-03-06', 'seed-a', 1),
      { ...row('Homework 2 (moved)', '2026-03-16', 'seed-a', 1), type: 'Quiz' },
    ]);

    expect(out.series[0].occurrences[1]).toEqual({
      name: 'Homework 2 (moved)',
      type: 'Quiz',
      dueDate: '2026-03-16',
    });
  });

  it('trims whitespace off names', () => {
    const out = groupIntoSeries([row('  Essay  ', '2026-03-06')]);
    expect(out.singles[0].name).toBe('Essay');
  });

  it('falls back to weekly when a group has no recorded interval', () => {
    const out = groupIntoSeries([
      row('Homework 1', '2026-03-06', 'seed-a', null),
      row('Homework 2', '2026-03-13', 'seed-a', null),
    ]);

    expect(out.series[0].intervalWeeks).toBe(1);
  });

  it('handles an empty grid', () => {
    expect(groupIntoSeries([])).toEqual({ series: [], singles: [] });
  });
});

describe('seriesRenames', () => {
  const all = [1, 2, 3, 4, 5];

  it('renames by stem, keeping each occurrence its own number', () => {
    const out = seriesRenames('Problem Set 3', 3, all);

    expect(out.map(r => r.name)).toEqual([
      'Problem Set 1', 'Problem Set 2', 'Problem Set 3', 'Problem Set 4', 'Problem Set 5',
    ]);
  });

  it('gives the anchor exactly the name that was typed', () => {
    const out = seriesRenames('Problem Set 3', 3, all);
    expect(out.find(r => r.index === 3)!.name).toBe('Problem Set 3');
  });

  it('numbers from the anchor position when no number was typed', () => {
    const out = seriesRenames('Problem Set', 3, all);

    expect(out.map(r => r.name)).toEqual([
      'Problem Set 1', 'Problem Set 2', 'Problem Set 3', 'Problem Set 4', 'Problem Set 5',
    ]);
  });

  it('shifts the whole sequence when the typed number is higher', () => {
    // "Homework 10" typed on the first occurrence continues a series that
    // started mid-semester.
    const out = seriesRenames('Homework 10', 1, [1, 2, 3]);
    expect(out.map(r => r.name)).toEqual(['Homework 10', 'Homework 11', 'Homework 12']);
  });

  it('clamps rather than running below 1', () => {
    const out = seriesRenames('HW 1', 5, all);
    expect(out.map(r => r.name)).toEqual(['HW 1', 'HW 2', 'HW 3', 'HW 4', 'HW 5']);
  });

  it('renames only the occurrences it is given', () => {
    // "This and later" from occurrence 3 — the first two keep their old names.
    const out = seriesRenames('Problem Set 3', 3, [3, 4, 5]);
    expect(out.map(r => r.name)).toEqual(['Problem Set 3', 'Problem Set 4', 'Problem Set 5']);
  });

  it('handles a single occurrence', () => {
    expect(seriesRenames('Essay 2', 2, [2])).toEqual([{ index: 2, name: 'Essay 2' }]);
  });

  it('trims the stem so the number never doubles up its spacing', () => {
    const out = seriesRenames('Lab   4', 4, [4, 5]);
    expect(out.map(r => r.name)).toEqual(['Lab 4', 'Lab 5']);
  });

  it('keeps a multi-word stem whole', () => {
    const out = seriesRenames('Reading response 2', 2, [1, 2]);
    expect(out.map(r => r.name)).toEqual(['Reading response 1', 'Reading response 2']);
  });

  it('falls back to the typed text when there is no stem to number', () => {
    expect(seriesRenames('42', 1, [1, 2]).map(r => r.name)).toEqual(['42', '42']);
    expect(seriesRenames('   ', 1, [1, 2]).map(r => r.name)).toEqual(['', '']);
  });
});

describe('detectSeriesCandidates', () => {
  const row = (id: string, name: string, dueDate: string) => ({ id, name, dueDate });

  it('finds a weekly run of three or more', () => {
    const out = detectSeriesCandidates([
      row('a', 'Homework 1', '2026-03-06'),
      row('b', 'Homework 2', '2026-03-13'),
      row('c', 'Homework 3', '2026-03-20'),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe('Homework');
    expect(out[0].intervalWeeks).toBe(1);
    expect(out[0].members.map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('finds a biweekly run', () => {
    const out = detectSeriesCandidates([
      row('a', 'Lab 1', '2026-03-06'),
      row('b', 'Lab 2', '2026-03-20'),
      row('c', 'Lab 3', '2026-04-03'),
    ]);

    expect(out[0].intervalWeeks).toBe(2);
  });

  it('refuses a pair — any two dates are evenly spaced', () => {
    const out = detectSeriesCandidates([
      row('a', 'Essay 1', '2026-03-06'),
      row('b', 'Essay 2', '2026-03-13'),
    ]);

    expect(out).toEqual([]);
  });

  it('ignores spacing that is not a whole number of weeks', () => {
    const out = detectSeriesCandidates([
      row('a', 'Homework 1', '2026-03-06'),
      row('b', 'Homework 2', '2026-03-11'),
      row('c', 'Homework 3', '2026-03-16'),
    ]);

    expect(out).toEqual([]);
  });

  it('ignores spacing wider than a month', () => {
    const out = detectSeriesCandidates([
      row('a', 'Report 1', '2026-01-02'),
      row('b', 'Report 2', '2026-02-06'),
      row('c', 'Report 3', '2026-03-13'),
    ]);

    expect(out).toEqual([]);
  });

  it('keeps different stems apart', () => {
    const out = detectSeriesCandidates([
      row('a', 'Homework 1', '2026-03-06'),
      row('b', 'Homework 2', '2026-03-13'),
      row('c', 'Homework 3', '2026-03-20'),
      row('d', 'Quiz 1', '2026-03-07'),
      row('e', 'Quiz 2', '2026-03-14'),
      row('f', 'Quiz 3', '2026-03-21'),
    ]);

    expect(out).toHaveLength(2);
    expect(out.map(c => c.stem).sort()).toEqual(['Homework', 'Quiz']);
  });

  it('takes the longest run and stops at a break in the rhythm', () => {
    const out = detectSeriesCandidates([
      row('a', 'Homework 1', '2026-03-06'),
      row('b', 'Homework 2', '2026-03-13'),
      row('c', 'Homework 3', '2026-03-20'),
      // Reading week — the next one is three weeks later, then weekly resumes.
      row('d', 'Homework 4', '2026-04-10'),
      row('e', 'Homework 5', '2026-04-17'),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].members.map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('never offers the same row in two candidates', () => {
    const out = detectSeriesCandidates([
      row('a', 'HW 1', '2026-03-06'),
      row('b', 'HW 2', '2026-03-13'),
      row('c', 'HW 3', '2026-03-20'),
      row('d', 'HW 4', '2026-03-27'),
      row('e', 'HW 5', '2026-04-03'),
      row('f', 'HW 6', '2026-04-10'),
    ]);

    const ids = out.flatMap(c => c.members.map(m => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sorts rows by date before looking for a rhythm', () => {
    const out = detectSeriesCandidates([
      row('c', 'Homework 3', '2026-03-20'),
      row('a', 'Homework 1', '2026-03-06'),
      row('b', 'Homework 2', '2026-03-13'),
    ]);

    expect(out[0].members.map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('groups rows whose names carry no number at all', () => {
    const out = detectSeriesCandidates([
      row('a', 'Reading response', '2026-03-06'),
      row('b', 'Reading response', '2026-03-13'),
      row('c', 'Reading response', '2026-03-20'),
    ]);

    expect(out[0].stem).toBe('Reading response');
  });

  it('skips a name that is only a number', () => {
    const out = detectSeriesCandidates([
      row('a', '1', '2026-03-06'),
      row('b', '2', '2026-03-13'),
      row('c', '3', '2026-03-20'),
    ]);

    expect(out).toEqual([]);
  });

  it('survives two rows sharing a date', () => {
    const out = detectSeriesCandidates([
      row('a', 'Homework 1', '2026-03-06'),
      row('b', 'Homework 2', '2026-03-06'),
      row('c', 'Homework 3', '2026-03-13'),
      row('d', 'Homework 4', '2026-03-20'),
    ]);

    // The duplicate date breaks the rhythm at the front; the rest still reads
    // as a run of three.
    expect(out).toHaveLength(1);
    expect(out[0].members).toHaveLength(3);
  });

  it('finds a run that crosses a DST boundary', () => {
    // US DST starts 2026-03-08: a naive ms division gives 6.96 days here.
    const out = detectSeriesCandidates([
      row('a', 'Homework 1', '2026-03-01'),
      row('b', 'Homework 2', '2026-03-08'),
      row('c', 'Homework 3', '2026-03-15'),
    ]);

    expect(out[0].intervalWeeks).toBe(1);
  });

  it('returns nothing for an empty list', () => {
    expect(detectSeriesCandidates([])).toEqual([]);
  });
});
