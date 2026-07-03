// Pure "what class is next" logic for the menu-bar / tray item — no Electron/Node
// imports, so it's unit-testable and reusable. Exception-aware: a cancelled
// occurrence is skipped and a moved one uses its new time/location.

import type { ClassMeeting, Course } from './types';
import { resolveOccurrence, type ExceptionIndex } from './meetingExceptions';
import { parseDateLocal } from './deadlines';

export interface UpcomingClass {
  meeting: ClassMeeting;
  course: Course | undefined;
  /** Local YYYY-MM-DD of this occurrence. */
  date: string;
  /** HH:MM after applying any exception (a moved class shows its new time). */
  startTime: string;
  endTime: string;
  location: string | null;
  /** Whole minutes from `now` to the start; 0 or negative once it has started. */
  minutesUntil: number;
  /** True when `now` falls within [start, end) — the class is happening right now. */
  inProgress: boolean;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** A local Date for `HH:MM` on the given `YYYY-MM-DD`. */
function atTime(dateStr: string, hhmm: string): Date {
  const d = parseDateLocal(dateStr);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Every class occurrence from `now` through the next `lookaheadDays`, soonest
 * first — the one in progress (if any) sorts first, then upcoming starts. A class
 * that has already ended today is dropped; a class still running is included and
 * flagged `inProgress`. Looks a week ahead by default so a class always resolves
 * even when the rest of the week is empty.
 */
export function findUpcomingClasses(
  meetings: ClassMeeting[],
  exceptions: ExceptionIndex,
  courses: Course[],
  now: Date = new Date(),
  opts: { lookaheadDays?: number; limit?: number } = {},
): UpcomingClass[] {
  const lookaheadDays = opts.lookaheadDays ?? 7;
  const courseById = new Map(courses.map(c => [c.id, c]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: UpcomingClass[] = [];

  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const day = addDays(today, offset);
    const dow = day.getDay();
    const dateStr = ymdLocal(day);

    for (const m of meetings) {
      if (m.day_of_week !== dow) continue;

      const occ = resolveOccurrence(m, dateStr, exceptions);
      if (occ.cancelled) continue;

      const start = atTime(dateStr, occ.startTime);
      const end = atTime(dateStr, occ.endTime);
      if (end.getTime() <= now.getTime()) continue; // already over

      out.push({
        meeting: m,
        course: courseById.get(m.course_id),
        date: dateStr,
        startTime: occ.startTime,
        endTime: occ.endTime,
        location: occ.location,
        minutesUntil: Math.round((start.getTime() - now.getTime()) / 60_000),
        inProgress: start.getTime() <= now.getTime() && now.getTime() < end.getTime(),
      });
    }
  }

  // Sort by absolute start (date, then clock time). An in-progress class has the
  // earliest start of its day, so it naturally lands first.
  out.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)));

  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** The single next (or in-progress) class, or null when nothing is scheduled ahead. */
export function findUpNextClass(
  meetings: ClassMeeting[],
  exceptions: ExceptionIndex,
  courses: Course[],
  now: Date = new Date(),
): UpcomingClass | null {
  return findUpcomingClasses(meetings, exceptions, courses, now, { limit: 1 })[0] ?? null;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** "9:05 AM" from "09:05". */
export function formatClock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Compact countdown for the menu-bar title:
 *   in progress → "now"; under an hour → "12m"; later today → "2h 5m";
 *   a future day → "Wed 9:00 AM".
 */
export function formatTrayCountdown(up: UpcomingClass, now: Date = new Date()): string {
  if (up.inProgress) return 'now';

  const todayStr = ymdLocal(now);
  if (up.date === todayStr) {
    const m = Math.max(0, up.minutesUntil);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h ${mm}m` : `${h}h`;
  }

  const d = parseDateLocal(up.date);
  return `${DOW[d.getDay()]} ${formatClock12(up.startTime)}`;
}

/** The menu-bar text itself, e.g. "MAT-273 · 12m" (or "Studeo" when nothing's next). */
export function formatTrayTitle(up: UpcomingClass | null, now: Date = new Date()): string {
  if (!up) return 'Studeo';
  const abbr = up.course?.abbreviation ?? 'Class';
  return `${abbr} · ${formatTrayCountdown(up, now)}`;
}

/** One detail line for the menu, e.g. "Calculus III · 9:00 AM–10:15 AM · Room 4". */
export function formatClassLine(up: UpcomingClass): string {
  const time = `${formatClock12(up.startTime)}–${formatClock12(up.endTime)}`;
  const parts = [up.course?.name ?? 'Class', time];
  if (up.location) parts.push(up.location);
  return parts.join(' · ');
}
