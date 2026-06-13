// Pure helpers for the class-notebook Timeline. NO electron/node imports.
import { parseDateLocal } from './deadlines';

export interface WeekBucket<T> {
  /** 1-based week relative to the term start (or the earliest note, if no term dates). */
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
 * Bucket dated notes into 7-day weeks anchored at the term start (or, if the term has no
 * start date, at the earliest note). Only weeks that contain notes are returned, sorted
 * chronologically; notes within a week are sorted by date. Undated notes are ignored here
 * (they belong to the Pages tree, not the Timeline).
 */
export function groupNotesByWeek<T extends { note_date: string | null }>(
  termStart: string | null,
  items: T[],
): WeekBucket<T>[] {
  const dated = items.filter((i) => i.note_date);
  if (dated.length === 0) return [];

  const earliest = dated.map((i) => i.note_date as string).sort()[0];
  const anchor = parseDateLocal(termStart ?? earliest);

  const buckets = new Map<number, WeekBucket<T>>();
  for (const item of dated) {
    const d = parseDateLocal(item.note_date as string);
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
    w.items.sort((a, b) => (a.note_date as string).localeCompare(b.note_date as string));
  }
  return weeks;
}
