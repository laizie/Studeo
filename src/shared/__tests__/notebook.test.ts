import { describe, it, expect } from 'vitest';
import { groupNotesByWeek } from '../notebook';

type N = { id: string; note_date: string | null };

describe('groupNotesByWeek', () => {
  it('returns no weeks when nothing is dated', () => {
    expect(groupNotesByWeek('2026-08-24', [{ id: 'a', note_date: null }])).toEqual([]);
  });

  it('buckets notes into 7-day weeks from the term start', () => {
    const notes: N[] = [
      { id: 'mon1', note_date: '2026-08-24' }, // week 1 (anchor day)
      { id: 'fri1', note_date: '2026-08-28' }, // week 1
      { id: 'mon2', note_date: '2026-08-31' }, // week 2
    ];
    const weeks = groupNotesByWeek('2026-08-24', notes);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekNumber).toBe(1);
    expect(weeks[0].start).toBe('2026-08-24');
    expect(weeks[0].end).toBe('2026-08-30');
    expect(weeks[0].items.map((n) => n.id)).toEqual(['mon1', 'fri1']); // sorted by date
    expect(weeks[1].weekNumber).toBe(2);
    expect(weeks[1].items.map((n) => n.id)).toEqual(['mon2']);
  });

  it('ignores undated notes', () => {
    const weeks = groupNotesByWeek('2026-08-24', [
      { id: 'dated', note_date: '2026-08-25' },
      { id: 'page', note_date: null },
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].items.map((n) => n.id)).toEqual(['dated']);
  });

  it('anchors to the earliest note when the term has no start date', () => {
    const weeks = groupNotesByWeek(null, [
      { id: 'later', note_date: '2026-09-10' },
      { id: 'first', note_date: '2026-09-01' },
    ]);
    expect(weeks[0].weekNumber).toBe(1);
    expect(weeks[0].start).toBe('2026-09-01');
    // 9 days apart → second week
    expect(weeks[weeks.length - 1].items.map((n) => n.id)).toContain('later');
  });
});
