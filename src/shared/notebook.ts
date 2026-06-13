// Pure helpers for the class-notebook Timeline. NO electron/node imports.
import { parseDateLocal } from './deadlines';
import { resolveOccurrence, type ExceptionIndex } from './meetingExceptions';
import type { ClassMeeting } from './types';

export interface WeekBucket<T> {
  /** 1-based week relative to the term start (or the earliest item, if no term dates). */
  weekNumber: number;
  start: string; // YYYY-MM-DD (inclusive)
  end: string;   // YYYY-MM-DD (inclusive, start + 6 days)
  items: T[];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Bucket dated items into 7-day weeks anchored at the term start (or, if there's no term
 * start, the earliest item). Only weeks that contain items are returned, sorted
 * chronologically; items within a week are sorted by date. Items with no date are dropped.
 */
export function bucketByWeek<T>(
  termStart: string | null,
  items: T[],
  getDate: (item: T) => string | null,
): WeekBucket<T>[] {
  const dated = items.filter((i) => getDate(i));
  if (dated.length === 0) return [];

  const earliest = dated.map((i) => getDate(i) as string).sort()[0];
  const anchor = parseDateLocal(termStart ?? earliest);

  const buckets = new Map<number, WeekBucket<T>>();
  for (const item of dated) {
    const d = parseDateLocal(getDate(item) as string);
    const diffDays = Math.floor((d.getTime() - anchor.getTime()) / 86_400_000);
    const weekNumber = Math.floor(diffDays / 7) + 1;
    if (!buckets.has(weekNumber)) {
      const start = addDays(anchor, (weekNumber - 1) * 7);
      buckets.set(weekNumber, { weekNumber, start: ymd(start), end: ymd(addDays(start, 6)), items: [] });
    }
    buckets.get(weekNumber)!.items.push(item);
  }

  const weeks = [...buckets.values()].sort((a, b) => a.weekNumber - b.weekNumber);
  for (const w of weeks) {
    w.items.sort((a, b) => (getDate(a) as string).localeCompare(getDate(b) as string));
  }
  return weeks;
}

/** Convenience wrapper for note objects (placed on the Timeline by their note_date). */
export function groupNotesByWeek<T extends { note_date: string | null }>(
  termStart: string | null,
  items: T[],
): WeekBucket<T>[] {
  return bucketByWeek(termStart, items, (i) => i.note_date);
}

export interface ClassSession {
  date: string; // YYYY-MM-DD
  meetingId: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

/**
 * Expand a course's recurring class meetings into concrete dated sessions across the term,
 * honoring exceptions (cancelled dates are dropped; moved dates use the new time/location).
 * Returns [] when the term has no start/end (we can't bound the expansion).
 */
export function expandClassSessions(
  termStart: string | null,
  termEnd: string | null,
  meetings: ClassMeeting[],
  exceptions: ExceptionIndex,
): ClassSession[] {
  if (!termStart || !termEnd || meetings.length === 0) return [];

  const start = parseDateLocal(termStart);
  const end = parseDateLocal(termEnd);
  const sessions: ClassSession[] = [];

  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = d.getDay();
    const dateStr = ymd(d);
    for (const m of meetings) {
      if (m.day_of_week !== dow) continue;
      const occ = resolveOccurrence(m, dateStr, exceptions);
      if (occ.cancelled) continue;
      sessions.push({
        date: dateStr,
        meetingId: m.id,
        startTime: occ.startTime,
        endTime: occ.endTime,
        location: occ.location,
      });
    }
  }
  return sessions;
}
