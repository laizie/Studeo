// Pure repeat-series logic — no Electron/Node imports so this is usable
// everywhere and unit-testable.
//
// Used by Day-One Setup: "Homework 1 due Jan 16, repeating weekly until May 1"
// expands into Homework 2, Homework 3, … with the dates filled in.

import { parseDateLocal } from './deadlines';

export interface RepeatOccurrence {
  name: string;
  dueDate: string; // YYYY-MM-DD
}

/** Safety cap — a year of twice-weekly meetings is ~104; nothing real exceeds this. */
export const MAX_REPEAT_OCCURRENCES = 120;

// Format a Date back to YYYY-MM-DD using LOCAL components (toISOString would
// shift the date across the UTC boundary during evening hours).
function toDateStrLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Continue a name's numbering. "Homework 1" → "Homework 2", "Homework 3"…
 * Names without a trailing number get one appended starting at 2
 * ("Reading quiz" → "Reading quiz 2"), so the original row stays as typed.
 *
 * @param step 1 for the first generated occurrence, 2 for the second, …
 */
function numberedName(name: string, step: number): string {
  const m = name.match(/^(.*?)(\d+)\s*$/);
  if (m) {
    return `${m[1]}${parseInt(m[2], 10) + step}`;
  }
  return `${name.trim()} ${step + 1}`;
}

/**
 * Generate the follow-up occurrences of a repeating assignment.
 *
 * Returns only the rows AFTER the first one — the caller already has the
 * first occurrence (the row the user typed). Dates step by `intervalWeeks`
 * from `startDate` and stop at `untilDate` (inclusive).
 *
 * Invalid input (bad dates, until before start, non-positive interval)
 * returns an empty list rather than throwing — the UI treats that as
 * "nothing to generate".
 */
export function generateRepeats(
  name: string,
  startDate: string,
  untilDate: string,
  intervalWeeks: number,
): RepeatOccurrence[] {
  if (!name.trim() || !startDate || !untilDate) return [];
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1) return [];

  const start = parseDateLocal(startDate);
  const until = parseDateLocal(untilDate);
  if (isNaN(start.getTime()) || isNaN(until.getTime())) return [];

  const out: RepeatOccurrence[] = [];
  // Stepping via setDate handles month/year rollover and DST correctly
  // because the Date stays anchored to local midnight.
  const cursor = new Date(start);
  for (let step = 1; step <= MAX_REPEAT_OCCURRENCES; step++) {
    cursor.setDate(cursor.getDate() + intervalWeeks * 7);
    if (cursor.getTime() > until.getTime()) break;
    out.push({ name: numberedName(name, step), dueDate: toDateStrLocal(cursor) });
  }
  return out;
}
