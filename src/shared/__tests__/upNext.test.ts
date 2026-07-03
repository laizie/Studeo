import { describe, it, expect } from 'vitest';
import type { ClassMeeting, Course, MeetingException } from '../types';
import { buildExceptionIndex } from '../meetingExceptions';
import {
  findUpNextClass,
  findUpcomingClasses,
  formatTrayCountdown,
  formatTrayTitle,
  formatClock12,
  type UpcomingClass,
} from '../upNext';

function course(over: Partial<Course> = {}): Course {
  return {
    id: 'c1', name: 'Calculus III', abbreviation: 'MAT-273', color: '#000',
    building: null, term_id: null, grade_weights: null, created_at: '', ...over,
  };
}

function meeting(over: Partial<ClassMeeting>): ClassMeeting {
  return { id: 'm1', course_id: 'c1', day_of_week: 0, start_time: '09:00', end_time: '10:15', location: null, ...over };
}

function exception(over: Partial<MeetingException>): MeetingException {
  return {
    id: 'e1', meeting_id: 'm1', date: '2026-09-09', kind: 'cancelled',
    new_start_time: null, new_end_time: null, new_location: null, ...over,
  };
}

// A fixed reference day. day_of_week is derived from it so the tests don't depend
// on what weekday Sep 9 2026 actually is.
const REF = new Date(2026, 8, 9, 8, 0); // 8:00 AM
const DOW = REF.getDay();
const noExceptions = buildExceptionIndex([]);

describe('findUpcomingClasses / findUpNextClass', () => {
  it('returns null when there are no meetings', () => {
    expect(findUpNextClass([], noExceptions, [course()], REF)).toBeNull();
  });

  it('picks the soonest class today and computes minutesUntil', () => {
    const early = meeting({ id: 'm1', day_of_week: DOW, start_time: '09:00', end_time: '10:15' });
    const late = meeting({ id: 'm2', day_of_week: DOW, start_time: '13:00', end_time: '14:00' });
    const up = findUpNextClass([late, early], noExceptions, [course()], REF);
    expect(up?.meeting.id).toBe('m1');
    expect(up?.minutesUntil).toBe(60); // 08:00 → 09:00
    expect(up?.inProgress).toBe(false);
    expect(up?.course?.abbreviation).toBe('MAT-273');
  });

  it('skips a class that has already ended today', () => {
    const now = new Date(2026, 8, 9, 11, 0); // after the 10:15 end
    const m1 = meeting({ id: 'm1', day_of_week: now.getDay(), start_time: '09:00', end_time: '10:15' });
    const m2 = meeting({ id: 'm2', day_of_week: now.getDay(), start_time: '13:00', end_time: '14:00' });
    const up = findUpNextClass([m1, m2], noExceptions, [course()], now);
    expect(up?.meeting.id).toBe('m2');
    expect(up?.minutesUntil).toBe(120);
  });

  it('rolls over to next week when the only class already ended', () => {
    const now = new Date(2026, 8, 9, 11, 0);
    const m1 = meeting({ id: 'm1', day_of_week: now.getDay(), start_time: '09:00', end_time: '10:15' });
    const up = findUpNextClass([m1], noExceptions, [course()], now);
    expect(up).not.toBeNull();
    // 7 days later, same weekday.
    expect(up?.date).toBe('2026-09-16');
  });

  it('flags a class in progress', () => {
    const now = new Date(2026, 8, 9, 9, 30); // within 09:00–10:15
    const m1 = meeting({ id: 'm1', day_of_week: now.getDay(), start_time: '09:00', end_time: '10:15' });
    const up = findUpNextClass([m1], noExceptions, [course()], now);
    expect(up?.inProgress).toBe(true);
    expect(up?.minutesUntil).toBe(-30);
  });

  it('skips a cancelled occurrence but keeps the recurring rule for later', () => {
    const m1 = meeting({ id: 'm1', day_of_week: DOW, start_time: '09:00', end_time: '10:15' });
    const ex = buildExceptionIndex([exception({ meeting_id: 'm1', date: '2026-09-09', kind: 'cancelled' })]);
    const up = findUpNextClass([m1], ex, [course()], REF);
    // Today is cancelled → next occurrence is a week out.
    expect(up?.date).toBe('2026-09-16');
  });

  it('uses a moved occurrence’s new time and location', () => {
    const m1 = meeting({ id: 'm1', day_of_week: DOW, start_time: '09:00', end_time: '10:15', location: 'Room 1' });
    const ex = buildExceptionIndex([
      exception({
        meeting_id: 'm1', date: '2026-09-09', kind: 'moved',
        new_start_time: '14:00', new_end_time: '15:00', new_location: 'Room 9',
      }),
    ]);
    const up = findUpNextClass([m1], ex, [course()], REF);
    expect(up?.startTime).toBe('14:00');
    expect(up?.location).toBe('Room 9');
    expect(up?.minutesUntil).toBe(360); // 08:00 → 14:00
  });

  it('lists multiple upcoming classes soonest-first', () => {
    const m1 = meeting({ id: 'm1', day_of_week: DOW, start_time: '13:00', end_time: '14:00' });
    const m2 = meeting({ id: 'm2', day_of_week: DOW, start_time: '09:00', end_time: '10:00' });
    const list = findUpcomingClasses([m1, m2], noExceptions, [course()], REF, { lookaheadDays: 0 });
    expect(list.map(u => u.meeting.id)).toEqual(['m2', 'm1']);
  });
});

describe('formatting', () => {
  const base: UpcomingClass = {
    meeting: meeting({}), course: course(), date: '2026-09-09',
    startTime: '09:00', endTime: '10:15', location: null, minutesUntil: 45, inProgress: false,
  };

  it('formatClock12 converts 24h to 12h', () => {
    expect(formatClock12('09:05')).toBe('9:05 AM');
    expect(formatClock12('13:00')).toBe('1:00 PM');
    expect(formatClock12('00:30')).toBe('12:30 AM');
  });

  it('countdown: in progress → now', () => {
    expect(formatTrayCountdown({ ...base, inProgress: true }, REF)).toBe('now');
  });

  it('countdown: under an hour → minutes', () => {
    expect(formatTrayCountdown({ ...base, minutesUntil: 45 }, REF)).toBe('45m');
  });

  it('countdown: later today → hours and minutes', () => {
    expect(formatTrayCountdown({ ...base, minutesUntil: 125 }, REF)).toBe('2h 5m');
    expect(formatTrayCountdown({ ...base, minutesUntil: 120 }, REF)).toBe('2h');
  });

  it('countdown: a future day → weekday and clock', () => {
    const up = { ...base, date: '2026-09-16', startTime: '09:00' };
    expect(formatTrayCountdown(up, REF)).toBe('Wed 9:00 AM');
  });

  it('title carries the abbreviation, or falls back to Studeo', () => {
    expect(formatTrayTitle({ ...base, minutesUntil: 12 }, REF)).toBe('MAT-273 · 12m');
    expect(formatTrayTitle(null, REF)).toBe('Studeo');
  });
});
