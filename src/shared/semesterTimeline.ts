// Semester timeline strip — pure layout math.
//
// Given a term's date span, its courses, and their assignments, this computes
// everything the strip needs to draw: each assignment's horizontal position
// (0..1 across the term), a per-week load histogram, the "today" marker, and
// which week is the heaviest (the week-11 pileup you want to spot in week 1).
//
// Purely derived — no schema, no storage. All positions are fractions so the UI
// can render them as `left: <fraction>%` at any width.

import type { Assignment, AssignmentType, Course } from './types';
import { parseDateLocal } from './deadlines';
import { localDayKey } from './studyStats';

// Exams and projects are the "major" markers — the big rocks a student plans
// around. Everything else is a light tick.
const MAJOR_TYPES = new Set<AssignmentType>(['Exam', 'Project']);

export interface TimelineMarker {
  id: string;
  name: string;
  type: AssignmentType;
  dueDate: string;
  /** 0..1 position along the bar. */
  position: number;
  /** Exam/Project → drawn larger. */
  major: boolean;
  completed: boolean;
}

export interface TimelineCourseRow {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  markers: TimelineMarker[];
}

export interface TimelineWeek {
  /** 1-based week number. */
  index: number;
  /** 0..1 left edge of the week. */
  startPosition: number;
  /** Assignments due this week across all courses. */
  count: number;
  /** How many of those are exams/projects. */
  majorCount: number;
  /** True for the single heaviest week. */
  isPeak: boolean;
}

export interface SemesterTimeline {
  startDate: string;
  endDate: string;
  totalDays: number;
  weeks: TimelineWeek[];
  /** 0..1, or null when today is outside the term span. */
  todayPosition: number | null;
  courses: TimelineCourseRow[];
  /** 1-based index of the heaviest week, or null when nothing is scheduled. */
  peakWeekIndex: number | null;
  /** Count in the heaviest week — used to scale the load histogram. */
  maxWeekCount: number;
}

// ── Small date helpers ────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// Whole days from `from` to `to`. Both parsed at local midnight, so DST wrinkles
// round away cleanly.
function diffDays(from: string, to: string): number {
  return Math.round(
    (parseDateLocal(to).getTime() - parseDateLocal(from).getTime()) / 86_400_000,
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build the timeline model, or null when it can't be drawn (no term, missing
 * dates, or a non-positive span). `courses` should already be scoped to the term.
 */
export function buildSemesterTimeline(
  term: { start_date: string | null; end_date: string | null } | null | undefined,
  courses: Course[],
  assignments: Assignment[],
  now: Date = new Date(),
): SemesterTimeline | null {
  if (!term?.start_date || !term.end_date) return null;
  const startDate = term.start_date;
  const endDate = term.end_date;
  const totalDays = diffDays(startDate, endDate);
  if (totalDays <= 0) return null;

  const position = (dateStr: string) => clamp01(diffDays(startDate, dateStr) / totalDays);
  const offsetOf = (dateStr: string) => diffDays(startDate, dateStr);
  const inSpan = (dateStr: string) => {
    const off = offsetOf(dateStr);
    return off >= 0 && off <= totalDays;
  };

  // Week buckets: day 0..6 is week 1, etc. The last partial week still counts.
  const weekCount = Math.floor(totalDays / 7) + 1;
  const buckets = Array.from({ length: weekCount }, () => ({ count: 0, major: 0 }));

  for (const a of assignments) {
    if (!inSpan(a.due_date)) continue;
    const wk = Math.floor(offsetOf(a.due_date) / 7);
    if (wk < 0 || wk >= weekCount) continue;
    buckets[wk].count += 1;
    if (MAJOR_TYPES.has(a.type)) buckets[wk].major += 1;
  }

  // Heaviest week (earliest on ties).
  let peakIdx = -1;
  let maxWeekCount = 0;
  buckets.forEach((b, i) => {
    if (b.count > maxWeekCount) { maxWeekCount = b.count; peakIdx = i; }
  });

  const weeks: TimelineWeek[] = buckets.map((b, i) => ({
    index: i + 1,
    startPosition: clamp01((i * 7) / totalDays),
    count: b.count,
    majorCount: b.major,
    isPeak: i === peakIdx && maxWeekCount > 0,
  }));

  const courseRows: TimelineCourseRow[] = courses.map(c => ({
    id: c.id,
    name: c.name,
    abbreviation: c.abbreviation,
    color: c.color,
    markers: assignments
      .filter(a => a.course_id === c.id && inSpan(a.due_date))
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        dueDate: a.due_date,
        position: position(a.due_date),
        major: MAJOR_TYPES.has(a.type),
        completed: a.status === 'completed',
      })),
  }));

  const todayKey = localDayKey(now);

  return {
    startDate,
    endDate,
    totalDays,
    weeks,
    todayPosition: inSpan(todayKey) ? position(todayKey) : null,
    courses: courseRows,
    peakWeekIndex: peakIdx >= 0 && maxWeekCount > 0 ? peakIdx + 1 : null,
    maxWeekCount,
  };
}
