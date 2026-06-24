import type { StudySession } from './types';

// Study activity stats for the GitHub-style contribution heatmap and the streak/
// total counters beside it. Pure functions over the logged study_sessions list, so
// they're unit-testable and reusable — no Electron/Node, no DB, no React. Only
// `kind === 'focus'` sessions count as "study time"; breaks don't.

/** Midnight (local) of the given date — heatmap buckets by local calendar day. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** A new date `n` days after `d` (n may be negative). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Local YYYY-MM-DD key. We avoid toISOString() here: it converts to UTC and would
    file an evening session under the next day for users behind UTC. */
export function localDayKey(d: Date): string {
  const y   = d.getFullYear();
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mon}-${day}`;
}

/** Total focus minutes per local day, keyed by YYYY-MM-DD. */
export function focusMinutesByDay(sessions: StudySession[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.kind !== 'focus') continue;
    const key = localDayKey(new Date(s.started_at));
    byDay.set(key, (byDay.get(key) ?? 0) + s.duration_seconds / 60);
  }
  return byDay;
}

/** Sum of all focus minutes ever logged. */
export function totalFocusMinutes(sessions: StudySession[]): number {
  return sessions.reduce((sum, s) => (s.kind === 'focus' ? sum + s.duration_seconds / 60 : sum), 0);
}

/** Focus minutes logged on or after `since` (inclusive) — e.g. "this week". */
export function focusMinutesSince(sessions: StudySession[], since: Date): number {
  const cutoff = since.getTime();
  return sessions.reduce(
    (sum, s) =>
      s.kind === 'focus' && new Date(s.started_at).getTime() >= cutoff
        ? sum + s.duration_seconds / 60
        : sum,
    0,
  );
}

/** Map focus minutes for a day to a 0–4 intensity bucket (à la GitHub's 5 shades). */
export function minutesToLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes < 1)   return 0;
  if (minutes < 30)  return 1;
  if (minutes < 60)  return 2;
  if (minutes < 120) return 3;
  return 4;
}

/**
 * Consecutive days, counting back from today, with at least one focus session.
 * Today not yet studied doesn't break a streak that's alive through yesterday —
 * it just hasn't been extended yet (GitHub treats the current day the same way).
 */
export function currentStreak(sessions: StudySession[], now: Date = new Date()): number {
  const byDay = focusMinutesByDay(sessions);
  let cursor  = startOfDay(now);
  if (!byDay.has(localDayKey(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (byDay.has(localDayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface HeatmapCell {
  /** YYYY-MM-DD */
  key: string;
  date: Date;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** Days after today within the trailing grid — rendered as empty placeholders. */
  future: boolean;
}

/** One column of the heatmap: 7 cells, Sunday → Saturday. */
export type HeatmapWeek = HeatmapCell[];

/**
 * Build a GitHub-style grid: `weeks` columns ending with the current week, each a
 * Sun→Sat run of days. The first column starts on the Sunday `weeks-1` weeks before
 * this week's Sunday, so the last column holds today.
 */
export function buildHeatmap(
  sessions: StudySession[],
  weeks = 53,
  now: Date = new Date(),
): HeatmapWeek[] {
  const byDay = focusMinutesByDay(sessions);
  const today = startOfDay(now);
  // Sunday of the first column: back up to this week's Sunday, then (weeks-1) weeks.
  const start = addDays(today, -today.getDay() - (weeks - 1) * 7);

  const grid: HeatmapWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date    = addDays(start, w * 7 + d);
      const key     = localDayKey(date);
      const minutes = byDay.get(key) ?? 0;
      column.push({
        key,
        date,
        minutes,
        level:  minutesToLevel(minutes),
        future: date.getTime() > today.getTime(),
      });
    }
    grid.push(column);
  }
  return grid;
}
