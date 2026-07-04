import { describe, it, expect } from 'vitest';
import { buildWeeklyReview } from '../weeklyReview';
import type { Assignment, AssignmentStatus, Task, StudySession } from '../types';

// A Sunday review, run on Sun Mar 15 2026 at 6 PM local.
//   weekStart (Mon) = 2026-03-09, weekEnd (Sun) = 2026-03-15
//   this week  = [Mar 9 00:00, Mar 16 00:00)
//   last week  = [Mar 2 00:00, Mar  9 00:00)
const NOW = new Date(2026, 2, 15, 18, 0);

// Build ISO instants from LOCAL wall-clock parts so the tests don't depend on the
// machine's timezone: the fixture and the code both reason in the same local frame.
function iso(y: number, mo: number, d: number, h = 12): string {
  return new Date(y, mo, d, h).toISOString();
}

function assign(
  id: string, dueDate: string, status: AssignmentStatus, completedAt: string | null = null,
): Assignment {
  return {
    id, course_id: 'c1', name: id, type: 'Homework', status,
    due_date: dueDate, due_time: null, notes: null, score: null,
    points_possible: null, completed_at: completedAt, created_at: '2026-01-01',
  };
}

function task(
  id: string, dueDate: string, status: AssignmentStatus, completedAt: string | null = null,
): Task {
  return { id, name: id, status, due_date: dueDate, completed_at: completedAt, created_at: '2026-01-01' };
}

function focus(id: string, startedAt: string, minutes: number): StudySession {
  return {
    id, started_at: startedAt, duration_seconds: minutes * 60,
    kind: 'focus', course_id: null, intention: null, reflection: null,
  };
}

describe('buildWeeklyReview', () => {
  it('assembles done / focus / rollover for the week containing now', () => {
    const assignments: Assignment[] = [
      assign('a-done-thisweek', '2026-03-11', 'completed', iso(2026, 2, 10)), // in week → done
      assign('a-done-lastweek', '2026-03-04', 'completed', iso(2026, 2, 4)),  // last week → not listed
      assign('a-done-legacy',   '2026-03-11', 'completed', null),             // no timestamp → not listed
      assign('a-overdue',       '2026-03-05', 'not_started'),                 // before today → rollover
      assign('a-future',        '2026-03-20', 'in_progress'),                 // neither
    ];
    const tasks: Task[] = [
      task('t-done', '2026-03-12', 'completed', iso(2026, 2, 11)), // in week → done
      task('t-overdue', '2026-03-01', 'not_started'),             // overdue → rollover
    ];
    const sessions: StudySession[] = [
      focus('s1', iso(2026, 2, 12), 60), // this week
      focus('s2', iso(2026, 2, 10), 30), // this week
      focus('s3', iso(2026, 2, 5), 45),  // last week
      { ...focus('s4', iso(2026, 2, 12), 10), kind: 'short_break' }, // breaks don't count
    ];

    const r = buildWeeklyReview(assignments, tasks, sessions, NOW);

    expect(r.weekStart).toBe('2026-03-09');
    expect(r.weekEnd).toBe('2026-03-15');

    // Done this week: the assignment + the task, newest completion first.
    expect(r.completed.map(i => i.id)).toEqual(['t-done', 'a-done-thisweek']);
    expect(r.completedCount).toBe(2);

    // Focus: 60 + 30 this week vs 45 last week.
    expect(r.focusThisWeekMinutes).toBe(90);
    expect(r.focusLastWeekMinutes).toBe(45);
    expect(r.focusDeltaMinutes).toBe(45);

    // Rollover: overdue + unfinished, oldest due first.
    expect(r.rollover.map(i => i.id)).toEqual(['t-overdue', 'a-overdue']);
    expect(r.rolloverCount).toBe(2);
  });

  it('treats the week as half-open [Mon, next Mon)', () => {
    const atWeekStart = iso(2026, 2, 9, 0);   // Mar 9 00:00 → in this week
    const atNextWeek  = iso(2026, 2, 16, 0);  // Mar 16 00:00 → next week, excluded

    const r = buildWeeklyReview(
      [
        assign('start-edge', '2026-03-09', 'completed', atWeekStart),
        assign('end-edge',   '2026-03-16', 'completed', atNextWeek),
      ],
      [],
      [focus('boundary', atWeekStart, 25)],
      NOW,
    );

    expect(r.completed.map(i => i.id)).toEqual(['start-edge']);
    expect(r.focusThisWeekMinutes).toBe(25);
  });

  it('returns empty lists and zero focus when there is nothing', () => {
    const r = buildWeeklyReview([], [], [], NOW);
    expect(r.completedCount).toBe(0);
    expect(r.rolloverCount).toBe(0);
    expect(r.focusThisWeekMinutes).toBe(0);
    expect(r.focusDeltaMinutes).toBe(0);
  });
});
