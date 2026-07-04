// Weekly Review — the pure model behind the Sunday review screen.
//
// Given the raw assignments, tasks, and study sessions, this assembles the three
// things the screen shows: what got DONE this week, focus time THIS week vs LAST
// week, and what ROLLS OVER (overdue-and-unfinished). No storage, no colors, no
// React — just derived numbers and lists, so it's unit-testable and reusable.
//
// "This week" is the Monday→Sunday week containing `now` — the same Monday-start
// convention the dashboard and This Week screen use. On a Sunday review that week
// is effectively complete, so we compare whole week vs whole previous week.

import type { Assignment, AssignmentType, Task, StudySession } from './types';
import { parseDateLocal } from './deadlines';
import { startOfDay, addDays, localDayKey } from './studyStats';

// A done-or-overdue row, flattened from either an assignment or a task so the two
// lists can be rendered uniformly. Course/type are null for tasks. Kept color-free
// on purpose — the UI looks up the course badge, exactly like the dashboard does.
export interface ReviewItem {
  id: string;
  kind: 'assignment' | 'task';
  name: string;
  /** Assignment's course; null for tasks. */
  courseId: string | null;
  /** Assignment type; null for tasks. */
  type: AssignmentType | null;
  dueDate: string;
  /** ISO/UTC; present on completed items, null on rollover items. */
  completedAt: string | null;
}

export interface WeeklyReview {
  /** Monday (YYYY-MM-DD, local) of the reviewed week. */
  weekStart: string;
  /** Sunday (YYYY-MM-DD, local) of the reviewed week. */
  weekEnd: string;

  /** Items whose completed_at falls in this week, newest first. */
  completed: ReviewItem[];
  completedCount: number;

  focusThisWeekMinutes: number;
  focusLastWeekMinutes: number;
  /** thisWeek − lastWeek (may be negative). */
  focusDeltaMinutes: number;

  /** Overdue-and-unfinished items (assignments + tasks), oldest due first. */
  rollover: ReviewItem[];
  rolloverCount: number;
}

// Monday (local midnight) of the week containing `d`. getDay() is 0=Sun..6=Sat,
// so Sunday reaches back six days; every other day steps back to its Monday.
function mondayOf(d: Date): Date {
  const t = startOfDay(d);
  const day = t.getDay();
  return addDays(t, day === 0 ? -6 : 1 - day);
}

// Focus (kind === 'focus') minutes with started_at in the half-open instant range
// [start, end). Half-open so the same session can't land in two adjacent weeks.
function focusMinutesInRange(sessions: StudySession[], start: Date, end: Date): number {
  const lo = start.getTime();
  const hi = end.getTime();
  let mins = 0;
  for (const s of sessions) {
    if (s.kind !== 'focus') continue;
    const t = new Date(s.started_at).getTime();
    if (t >= lo && t < hi) mins += s.duration_seconds / 60;
  }
  return mins;
}

function assignmentItem(a: Assignment): ReviewItem {
  return {
    id: a.id, kind: 'assignment', name: a.name,
    courseId: a.course_id, type: a.type,
    dueDate: a.due_date, completedAt: a.completed_at,
  };
}

function taskItem(t: Task): ReviewItem {
  return {
    id: t.id, kind: 'task', name: t.name,
    courseId: null, type: null,
    dueDate: t.due_date, completedAt: t.completed_at,
  };
}

/**
 * Assemble the review for the week containing `now`.
 *
 * Note on legacy data: items completed before completed_at existed have a null
 * timestamp, so they simply don't appear in "what got done" — we can't invent a
 * date. They're still counted as completed everywhere else via `status`.
 */
export function buildWeeklyReview(
  assignments: Assignment[],
  tasks: Task[],
  sessions: StudySession[],
  now: Date = new Date(),
): WeeklyReview {
  const weekStart     = mondayOf(now);
  const weekEndDate   = addDays(weekStart, 6);   // Sunday
  const nextWeekStart = addDays(weekStart, 7);
  const lastWeekStart = addDays(weekStart, -7);
  const todayMidnight = startOfDay(now);

  // "Done this week": completed_at is an instant, so compare by getTime() against
  // the local week bounds [weekStart, nextWeekStart).
  const lo = weekStart.getTime();
  const hi = nextWeekStart.getTime();
  const completedInWeek = (completedAt: string | null): boolean => {
    if (!completedAt) return false;
    const t = new Date(completedAt).getTime();
    return t >= lo && t < hi;
  };

  const completed: ReviewItem[] = [
    ...assignments.filter(a => a.status === 'completed' && completedInWeek(a.completed_at)).map(assignmentItem),
    ...tasks.filter(t => t.status === 'completed' && completedInWeek(t.completed_at)).map(taskItem),
  ].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')); // newest first

  // "Rolls over": due before today and not finished. due_date is a local calendar
  // day, so parse at local midnight and compare to today's midnight.
  const isOverdue = (dueDate: string, status: string): boolean =>
    status !== 'completed' && parseDateLocal(dueDate) < todayMidnight;

  const rollover: ReviewItem[] = [
    ...assignments.filter(a => isOverdue(a.due_date, a.status)).map(assignmentItem),
    ...tasks.filter(t => isOverdue(t.due_date, t.status)).map(taskItem),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate)); // oldest overdue first

  const focusThisWeekMinutes = focusMinutesInRange(sessions, weekStart, nextWeekStart);
  const focusLastWeekMinutes = focusMinutesInRange(sessions, lastWeekStart, weekStart);

  return {
    weekStart: localDayKey(weekStart),
    weekEnd:   localDayKey(weekEndDate),
    completed,
    completedCount: completed.length,
    focusThisWeekMinutes,
    focusLastWeekMinutes,
    focusDeltaMinutes: focusThisWeekMinutes - focusLastWeekMinutes,
    rollover,
    rolloverCount: rollover.length,
  };
}
