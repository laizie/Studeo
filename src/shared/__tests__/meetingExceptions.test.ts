import { describe, it, expect } from 'vitest';
import { buildExceptionIndex, resolveOccurrence } from '../meetingExceptions';
import type { ClassMeeting, MeetingException } from '../types';

const meeting: ClassMeeting = {
  id: 'm1',
  course_id: 'c1',
  day_of_week: 4, // Thursday
  start_time: '09:35',
  end_time: '10:50',
  location: 'Hall 204',
};

function exception(overrides: Partial<MeetingException>): MeetingException {
  return {
    id: 'e1',
    meeting_id: 'm1',
    date: '2026-11-26',
    kind: 'cancelled',
    new_start_time: null,
    new_end_time: null,
    new_location: null,
    ...overrides,
  };
}

describe('resolveOccurrence', () => {
  it('returns the regular slot when there is no exception', () => {
    const index = buildExceptionIndex([]);
    const out = resolveOccurrence(meeting, '2026-11-26', index);
    expect(out).toEqual({
      cancelled: false,
      startTime: '09:35',
      endTime: '10:50',
      location: 'Hall 204',
      moved: false,
    });
  });

  it('marks a cancelled occurrence', () => {
    const index = buildExceptionIndex([exception({ kind: 'cancelled' })]);
    expect(resolveOccurrence(meeting, '2026-11-26', index).cancelled).toBe(true);
  });

  it('only affects the exception date, not other weeks', () => {
    const index = buildExceptionIndex([exception({ kind: 'cancelled' })]);
    expect(resolveOccurrence(meeting, '2026-12-03', index).cancelled).toBe(false);
  });

  it('only affects the matching meeting, not others on the same date', () => {
    const other: ClassMeeting = { ...meeting, id: 'm2' };
    const index = buildExceptionIndex([exception({ kind: 'cancelled' })]);
    expect(resolveOccurrence(other, '2026-11-26', index).cancelled).toBe(false);
  });

  it('applies moved time and location', () => {
    const index = buildExceptionIndex([
      exception({
        kind: 'moved',
        new_start_time: '14:00',
        new_end_time: '15:15',
        new_location: 'Room 110',
      }),
    ]);
    const out = resolveOccurrence(meeting, '2026-11-26', index);
    expect(out).toEqual({
      cancelled: false,
      startTime: '14:00',
      endTime: '15:15',
      location: 'Room 110',
      moved: true,
    });
  });

  it('keeps the regular location when a move only changes the time', () => {
    const index = buildExceptionIndex([
      exception({ kind: 'moved', new_start_time: '14:00', new_end_time: '15:15' }),
    ]);
    const out = resolveOccurrence(meeting, '2026-11-26', index);
    expect(out.location).toBe('Hall 204');
    expect(out.moved).toBe(true);
  });
});
