import { describe, it, expect } from 'vitest';
import { groupNotesByWeek, expandClassSessions } from '../notebook';
import { buildExceptionIndex } from '../meetingExceptions';
import type { ClassMeeting, MeetingException } from '../types';

type N = { id: string; note_date: string | null };

// 2026-01-05 is a Monday (day_of_week 1).
const monday: ClassMeeting = {
  id: 'm1', course_id: 'c1', day_of_week: 1, start_time: '09:00', end_time: '10:00', location: 'Rm 1',
};

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

describe('expandClassSessions', () => {
  const empty = buildExceptionIndex([]);

  it('returns [] without term dates', () => {
    expect(expandClassSessions(null, '2026-01-18', [monday], empty)).toEqual([]);
  });

  it('expands a weekly meeting to each matching weekday in range', () => {
    const sessions = expandClassSessions('2026-01-05', '2026-01-18', [monday], empty);
    expect(sessions.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-12']);
    expect(sessions.every((s) => s.startTime === '09:00')).toBe(true);
  });

  it('drops cancelled occurrences', () => {
    const ex: MeetingException = {
      id: 'e1', meeting_id: 'm1', date: '2026-01-12', kind: 'cancelled',
      new_start_time: null, new_end_time: null, new_location: null,
    };
    const sessions = expandClassSessions('2026-01-05', '2026-01-18', [monday], buildExceptionIndex([ex]));
    expect(sessions.map((s) => s.date)).toEqual(['2026-01-05']);
  });

  it('reflects a moved occurrence time/location', () => {
    const ex: MeetingException = {
      id: 'e2', meeting_id: 'm1', date: '2026-01-05', kind: 'moved',
      new_start_time: '11:00', new_end_time: '12:00', new_location: 'Rm 2',
    };
    const [first] = expandClassSessions('2026-01-05', '2026-01-18', [monday], buildExceptionIndex([ex]));
    expect(first.startTime).toBe('11:00');
    expect(first.location).toBe('Rm 2');
  });
});
