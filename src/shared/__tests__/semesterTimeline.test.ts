import { describe, it, expect } from 'vitest';
import { buildSemesterTimeline } from '../semesterTimeline';
import type { Assignment, AssignmentType, Course } from '../types';

// Jan 1 → Apr 1 2026 is exactly 90 days (31 + 28 + 31), so day N sits at N/90.
const TERM = { start_date: '2026-01-01', end_date: '2026-04-01' };

function course(id: string, abbr: string): Course {
  return {
    id, name: `${abbr} course`, abbreviation: abbr, color: '#123456',
    building: null, term_id: 't1', grade_weights: null, created_at: '2026-01-01',
  };
}

function assign(
  id: string, courseId: string, dueDate: string, type: AssignmentType = 'Assignment',
  status: Assignment['status'] = 'not_started',
): Assignment {
  return {
    id, course_id: courseId, name: id, type, status, due_date: dueDate,
    due_time: null, notes: null, score: null, points_possible: null, created_at: '2026-01-01',
  };
}

const COURSES = [course('a', 'CS'), course('b', 'BIO')];
const ASSIGNMENTS = [
  assign('hw',      'a', '2026-01-08', 'Homework'),              // day 7  → week 2
  assign('exam',    'a', '2026-02-15', 'Exam'),                  // day 45 → week 7 (major)
  assign('project', 'b', '2026-02-15', 'Project'),              // day 45 → week 7 (major)
  assign('quiz',    'b', '2026-02-17', 'Quiz'),                  // day 47 → week 7
  assign('reading', 'b', '2026-03-01', 'Reading', 'completed'),  // day 59 → week 9
  assign('after',   'a', '2026-05-01', 'Exam'),                  // outside span → dropped
  assign('before',  'b', '2025-12-20', 'Quiz'),                  // outside span → dropped
];

const NOW = new Date(2026, 1, 15, 10, 0); // Feb 15 → day 45

describe('buildSemesterTimeline', () => {
  const t = buildSemesterTimeline(TERM, COURSES, ASSIGNMENTS, NOW)!;

  it('spans the whole term', () => {
    expect(t.totalDays).toBe(90);
    expect(t.weeks).toHaveLength(13); // floor(90/7)+1
  });

  it('positions markers as day/total fractions', () => {
    const cs = t.courses.find(c => c.id === 'a')!;
    const hw = cs.markers.find(m => m.id === 'hw')!;
    const exam = cs.markers.find(m => m.id === 'exam')!;
    expect(hw.position).toBeCloseTo(7 / 90, 5);
    expect(exam.position).toBeCloseTo(0.5, 5);
  });

  it('flags exams and projects as major', () => {
    const exam = t.courses.flatMap(c => c.markers).find(m => m.id === 'exam')!;
    const quiz = t.courses.flatMap(c => c.markers).find(m => m.id === 'quiz')!;
    expect(exam.major).toBe(true);
    expect(quiz.major).toBe(false);
  });

  it('carries completed status through', () => {
    const reading = t.courses.flatMap(c => c.markers).find(m => m.id === 'reading')!;
    expect(reading.completed).toBe(true);
  });

  it('drops assignments outside the term span', () => {
    const ids = t.courses.flatMap(c => c.markers).map(m => m.id);
    expect(ids).not.toContain('after');
    expect(ids).not.toContain('before');
  });

  it('builds a per-week load histogram', () => {
    const wk = (n: number) => t.weeks.find(w => w.index === n)!;
    expect(wk(2).count).toBe(1);
    expect(wk(7).count).toBe(3);       // exam + project + quiz
    expect(wk(7).majorCount).toBe(2);  // exam + project
    expect(wk(9).count).toBe(1);
  });

  it('identifies the heaviest week as the pileup', () => {
    expect(t.peakWeekIndex).toBe(7);
    expect(t.maxWeekCount).toBe(3);
    expect(t.weeks.find(w => w.index === 7)!.isPeak).toBe(true);
    expect(t.weeks.filter(w => w.isPeak)).toHaveLength(1);
  });

  it('places today when inside the span, null when outside', () => {
    expect(t.todayPosition).toBeCloseTo(0.5, 5);
    const outside = buildSemesterTimeline(TERM, COURSES, ASSIGNMENTS, new Date(2026, 5, 1))!;
    expect(outside.todayPosition).toBeNull();
  });

  it('week start positions are cumulative fractions', () => {
    expect(t.weeks[0].startPosition).toBe(0);
    expect(t.weeks.find(w => w.index === 7)!.startPosition).toBeCloseTo(42 / 90, 5);
  });
});

describe('buildSemesterTimeline — not drawable', () => {
  it('returns null with no term', () => {
    expect(buildSemesterTimeline(null, COURSES, ASSIGNMENTS, NOW)).toBeNull();
  });

  it('returns null when dates are missing', () => {
    expect(buildSemesterTimeline({ start_date: '2026-01-01', end_date: null }, COURSES, ASSIGNMENTS, NOW)).toBeNull();
  });

  it('returns null for a non-positive span', () => {
    expect(buildSemesterTimeline({ start_date: '2026-04-01', end_date: '2026-01-01' }, COURSES, ASSIGNMENTS, NOW)).toBeNull();
  });

  it('handles a term with no assignments', () => {
    const empty = buildSemesterTimeline(TERM, COURSES, [], NOW)!;
    expect(empty.peakWeekIndex).toBeNull();
    expect(empty.maxWeekCount).toBe(0);
    expect(empty.courses.every(c => c.markers.length === 0)).toBe(true);
  });
});
