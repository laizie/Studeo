import { describe, it, expect } from 'vitest';
import { selectUpcomingExams, formatExamDay } from '../exams';
import type { Assignment, AssignmentType, Course } from '../types';

function course(id: string, abbr: string): Course {
  return {
    id, name: `${abbr} course`, abbreviation: abbr, color: '#123456',
    building: null, term_id: 't1', grade_weights: null, created_at: '2026-01-01',
  };
}

function assign(
  id: string, courseId: string, dueDate: string,
  { type = 'Exam' as AssignmentType, time = null as string | null, status = 'not_started' as Assignment['status'] } = {},
): Assignment {
  return {
    id, course_id: courseId, name: id, type, status, due_date: dueDate,
    due_time: time, notes: null, score: null, points_possible: null,
    completed_at: null, created_at: '2026-01-01',
  };
}

const COURSES = [course('a', 'CS'), course('b', 'BIO')];

// Mid-morning on Feb 15, so "today" is a partly-spent day — an exam dated today
// must still be listed.
const NOW = new Date(2026, 1, 15, 10, 30);

describe('selectUpcomingExams', () => {
  it('keeps only upcoming, uncompleted exams', () => {
    const { exams } = selectUpcomingExams([
      assign('past',      'a', '2026-02-14'),
      assign('today',     'a', '2026-02-15'),
      assign('soon',      'a', '2026-03-01'),
      assign('done',      'a', '2026-03-05', { status: 'completed' }),
      assign('homework',  'a', '2026-02-20', { type: 'Homework' }),
      assign('quiz',      'b', '2026-02-20', { type: 'Quiz' }),
    ], COURSES, NOW);

    expect(exams.map(e => e.assignment.id)).toEqual(['today', 'soon']);
  });

  it('is not windowed — a final months out still shows', () => {
    const { exams } = selectUpcomingExams(
      [assign('final', 'a', '2026-05-12')], COURSES, NOW,
    );
    expect(exams).toHaveLength(1);
    expect(exams[0].daysUntil).toBe(86); // 13 Feb + 31 Mar + 30 Apr + 12 May
  });

  it('sorts by date, then all-day before timed within a day', () => {
    const { exams } = selectUpcomingExams([
      assign('late-day',  'a', '2026-02-20', { time: '14:00' }),
      assign('early-day', 'a', '2026-02-20', { time: '08:00' }),
      assign('all-day',   'b', '2026-02-20'),
      assign('sooner',    'b', '2026-02-16', { time: '23:00' }),
    ], COURSES, NOW);

    expect(exams.map(e => e.assignment.id))
      .toEqual(['sooner', 'all-day', 'early-day', 'late-day']);
  });

  it('counts days from local midnight, not from the current hour', () => {
    const { exams } = selectUpcomingExams([
      assign('today',    'a', '2026-02-15', { time: '09:00' }), // already started today
      assign('tomorrow', 'a', '2026-02-16'),
    ], COURSES, NOW);

    expect(exams.map(e => e.daysUntil)).toEqual([0, 1]);
  });

  it('labels the day and the time of day', () => {
    const { exams } = selectUpcomingExams([
      assign('midterm', 'a', '2026-02-17', { time: '09:35' }),
      assign('allday',  'b', '2026-02-18'),
    ], COURSES, NOW);

    expect(exams[0].dayLabel).toBe('Tue, Feb 17');
    expect(exams[0].timeLabel).toBe('9:35 AM');
    expect(exams[1].timeLabel).toBeNull(); // no due_time = all-day, don't invent one
  });

  it('resolves the course, and survives an orphaned one', () => {
    const { exams } = selectUpcomingExams([
      assign('mine',    'a',       '2026-02-17'),
      assign('orphan',  'missing', '2026-02-18'),
    ], COURSES, NOW);

    expect(exams[0].course?.abbreviation).toBe('CS');
    expect(exams[1].course).toBeUndefined();
  });

  it('caps at the limit and reports what it hid', () => {
    const all = [
      assign('e1', 'a', '2026-02-16'),
      assign('e2', 'a', '2026-02-17'),
      assign('e3', 'a', '2026-02-18'),
      assign('e4', 'a', '2026-02-19'),
    ];
    const { exams, hiddenCount } = selectUpcomingExams(all, COURSES, NOW, { limit: 2 });
    expect(exams.map(e => e.assignment.id)).toEqual(['e1', 'e2']);
    expect(hiddenCount).toBe(2);

    expect(selectUpcomingExams(all, COURSES, NOW).hiddenCount).toBe(0);
    expect(selectUpcomingExams(all, COURSES, NOW, { limit: 9 }).hiddenCount).toBe(0);
  });

  it('returns an empty result rather than throwing on no data', () => {
    expect(selectUpcomingExams([], [], NOW)).toEqual({ exams: [], hiddenCount: 0 });
  });
});

describe('formatExamDay', () => {
  it('parses the date as local, not UTC (no off-by-one in negative offsets)', () => {
    expect(formatExamDay('2026-02-17')).toBe('Tue, Feb 17');
    expect(formatExamDay('2026-01-01')).toBe('Thu, Jan 1');
  });
});
