import { parseDateLocal } from './deadlines';

// ── Exam back-planning ───────────────────────────────────────────────────────────
// Turn "an exam on date X" into a handful of study blocks spread across the days
// before it. Pure date math (no Node/Electron) so it's unit-testable and reusable.

export interface PlannedBlock {
  scheduledDate: string;   // 'YYYY-MM-DD'
  durationMinutes: number;
  title: string;
}

export interface PlanOptions {
  sessions: number;
  durationMinutes: number;
  title: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Whole days from `today` (inclusive) up to `examDate` (exclusive). 0 if exam is today/past. */
export function daysUntil(examDate: string, today: string): number {
  const exam = parseDateLocal(examDate).getTime();
  const now  = parseDateLocal(today).getTime();
  return Math.max(0, Math.round((exam - now) / 86_400_000));
}

/** A sensible default number of sessions for the dialog: ~one every three days, 2–6. */
export function suggestSessionCount(days: number): number {
  return clamp(Math.round(days / 3), 2, 6);
}

function addDays(dateStr: string, days: number): string {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + days);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/**
 * Evenly spread `sessions` study blocks across the open window [today, examDate) —
 * never on the exam day itself. The blocks run from today through the day before the
 * exam, with the rest spaced evenly between. You can't have more blocks than days, so
 * the count is capped at the number of available days (one block per day, max).
 */
export function planStudyBlocks(examDate: string, today: string, opts: PlanOptions): PlannedBlock[] {
  const windowDays = daysUntil(examDate, today);
  if (windowDays <= 0) return [];

  const n = clamp(Math.round(opts.sessions), 1, windowDays);

  // Day offsets (0 = today) for each block.
  const offsets: number[] =
    n === 1
      ? [Math.floor((windowDays - 1) / 2)]                       // a single block sits mid-window
      : Array.from({ length: n }, (_, i) =>                      // endpoints at today & day-before-exam
          Math.round((i * (windowDays - 1)) / (n - 1)),
        );

  return offsets.map((off) => ({
    scheduledDate: addDays(today, off),
    durationMinutes: opts.durationMinutes,
    title: opts.title,
  }));
}
