// Upcoming exams — pure selection logic, no Electron/Node imports, so it's
// unit-testable and usable from any screen.
//
// Exams are the one deadline a student plans a whole week around, and the
// Dashboard's other lists are windowed (this week / overdue): a midterm three
// weeks out is invisible until it's nearly here. This picks them out of the
// assignment list regardless of how far away they are, with the day *and* the
// time of day — an exam at 8 AM in a room across campus is a different morning
// than one at 4 PM.

import type { Assignment, Course } from './types';
import { parseDateLocal, dueSortValue, formatClock12 } from './deadlines';

export interface UpcomingExam {
  assignment: Assignment;
  /** Undefined only when the course lookup misses (orphaned row). */
  course: Course | undefined;
  /** Whole days from today to the exam; 0 = today. Never negative. */
  daysUntil: number;
  /** The calendar day, spelled out: "Tue, Oct 14". */
  dayLabel: string;
  /** "9:35 AM", or null when the exam carries no due_time (all-day). */
  timeLabel: string | null;
}

export interface UpcomingExamsOptions {
  /** Cap the list; the count of everything beyond it comes back as `hiddenCount`. */
  limit?: number;
}

export interface UpcomingExamsResult {
  exams: UpcomingExam[];
  /** How many further exams the `limit` trimmed off. 0 when nothing was cut. */
  hiddenCount: number;
}

/** The calendar day of an exam, e.g. "Tue, Oct 14". */
export function formatExamDay(dueDate: string): string {
  return parseDateLocal(dueDate).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

/**
 * Every exam still ahead of `today` (today itself included, all day long),
 * soonest first. Completed ones drop out; so does anything whose date has
 * passed — a missed exam is the Overdue section's job, not this list's.
 *
 * `assignments` and `courses` are expected to be pre-scoped by the caller (the
 * Dashboard hands over its term-filtered sets), so no term filtering happens here.
 */
export function selectUpcomingExams(
  assignments: Assignment[],
  courses: Course[],
  today: Date = new Date(),
  opts: UpcomingExamsOptions = {},
): UpcomingExamsResult {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const courseById = new Map(courses.map(c => [c.id, c]));

  const upcoming = assignments
    .filter(a =>
      a.type === 'Exam' &&
      a.status !== 'completed' &&
      parseDateLocal(a.due_date) >= todayMidnight)
    .sort((a, b) =>
      dueSortValue(a.due_date, a.due_time).localeCompare(dueSortValue(b.due_date, b.due_time)));

  const { limit } = opts;
  const shown = limit !== undefined ? upcoming.slice(0, Math.max(0, limit)) : upcoming;

  return {
    exams: shown.map(a => ({
      assignment: a,
      course: courseById.get(a.course_id),
      daysUntil: Math.round(
        (parseDateLocal(a.due_date).getTime() - todayMidnight.getTime()) / 86_400_000,
      ),
      dayLabel: formatExamDay(a.due_date),
      timeLabel: a.due_time ? formatClock12(a.due_time) : null,
    })),
    hiddenCount: upcoming.length - shown.length,
  };
}
