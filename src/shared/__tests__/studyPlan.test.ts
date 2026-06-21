import { describe, it, expect } from 'vitest';
import {
  planStudyBlocks,
  suggestSessionCount,
  daysUntil,
} from '../studyPlan';

const OPTS = { durationMinutes: 50, title: 'Study: Midterm' };

describe('daysUntil', () => {
  it('counts whole days to the exam (exclusive)', () => {
    expect(daysUntil('2026-07-01', '2026-06-19')).toBe(12);
    expect(daysUntil('2026-06-20', '2026-06-19')).toBe(1);
  });
  it('is 0 when the exam is today or in the past', () => {
    expect(daysUntil('2026-06-19', '2026-06-19')).toBe(0);
    expect(daysUntil('2026-06-10', '2026-06-19')).toBe(0);
  });
});

describe('suggestSessionCount', () => {
  it('suggests ~one session every three days, clamped to 2–6', () => {
    expect(suggestSessionCount(12)).toBe(4);   // the pitch example
    expect(suggestSessionCount(3)).toBe(2);    // clamps up to the floor
    expect(suggestSessionCount(30)).toBe(6);   // clamps to the ceiling
  });
});

describe('planStudyBlocks', () => {
  it('the 12-days→4-sessions example: 4 blocks, evenly spread, none on exam day', () => {
    const blocks = planStudyBlocks('2026-07-01', '2026-06-19', { ...OPTS, sessions: 4 });
    expect(blocks).toHaveLength(4);
    expect(blocks.map(b => b.scheduledDate)).toEqual([
      '2026-06-19', // today
      '2026-06-23',
      '2026-06-26',
      '2026-06-30', // day before the exam
    ]);
    expect(blocks.every(b => b.scheduledDate < '2026-07-01')).toBe(true);
    expect(blocks.every(b => b.durationMinutes === 50)).toBe(true);
  });

  it('never schedules on or after the exam day', () => {
    const blocks = planStudyBlocks('2026-07-01', '2026-06-19', { ...OPTS, sessions: 6 });
    expect(blocks.every(b => b.scheduledDate < '2026-07-01')).toBe(true);
  });

  it('produces strictly increasing, distinct dates', () => {
    const dates = planStudyBlocks('2026-07-01', '2026-06-19', { ...OPTS, sessions: 5 })
      .map(b => b.scheduledDate);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it('caps the count at the number of available days (one block per day max)', () => {
    // Exam in 3 days but 6 sessions requested → at most 3 blocks, on 3 distinct days.
    const blocks = planStudyBlocks('2026-06-22', '2026-06-19', { ...OPTS, sessions: 6 });
    expect(blocks).toHaveLength(3);
    expect(blocks.map(b => b.scheduledDate)).toEqual(['2026-06-19', '2026-06-20', '2026-06-21']);
  });

  it('places a single session mid-window', () => {
    const blocks = planStudyBlocks('2026-07-01', '2026-06-19', { ...OPTS, sessions: 1 });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].scheduledDate).toBe('2026-06-24'); // floor((12-1)/2) = 5 days out
  });

  it('returns nothing when the exam is today or past', () => {
    expect(planStudyBlocks('2026-06-19', '2026-06-19', { ...OPTS, sessions: 4 })).toEqual([]);
    expect(planStudyBlocks('2026-06-10', '2026-06-19', { ...OPTS, sessions: 4 })).toEqual([]);
  });
});
