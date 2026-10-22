// Pure repeat-series logic — no Electron/Node imports so this is usable
// everywhere and unit-testable.
//
// Used by Day-One Setup: "Homework 1 due Jan 16, repeating weekly until May 1"
// expands into Homework 2, Homework 3, … with the dates filled in.

import { parseDateLocal } from './deadlines';
import type { AssignmentStatus, AssignmentType } from './types';

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

// ─── Moving a series around ───────────────────────────────────────────────────
// The repeat rule above is only half the story. Once a semester is underway the
// dates move — the prof falls behind, a class gets cancelled, a quiz slides a
// week — so the other half is shifting occurrences that already exist.

/**
 * Add (or subtract, for a negative `days`) whole days to a YYYY-MM-DD date.
 *
 * Stays in local time throughout: parseDateLocal gives local midnight, setDate
 * handles month/year rollover, and toDateStrLocal reads the local components
 * back. Going via toISOString instead would shift the date by a day during
 * evening hours, which is the classic way a "+7 days" button loses a day.
 *
 * Returns '' for input it can't parse, matching generateRepeats' habit of
 * treating bad input as "nothing to do" rather than throwing.
 */
export function shiftDate(date: string, days: number): string {
  if (!date || !Number.isInteger(days)) return '';
  const d = parseDateLocal(date);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return toDateStrLocal(d);
}

/**
 * Why a bulk shift should leave this occurrence alone — or null if it's fair game.
 *
 * Finished work is history: its due date is the date it was actually due, and a
 * score is a fact about a specific graded thing. Sliding either because the
 * REST of the series moved would quietly rewrite the past, so a bulk move skips
 * them and reports what it skipped instead.
 *
 * Checked in order: a completed-and-graded row reports as 'completed', the more
 * obvious of the two reasons to a reader.
 *
 * `score` is optional because tasks don't have one — for them this is simply a
 * question about completion.
 */
export function shiftSkipReason(
  occurrence: { status: AssignmentStatus; score?: number | null },
): 'completed' | 'graded' | null {
  if (occurrence.status === 'completed') return 'completed';
  if (occurrence.score != null) return 'graded';
  return null;
}

// ─── Turning an edited grid back into series ──────────────────────────────────

/** A row as Day-One Setup's grid holds it, once it has a date and a name. */
export interface GroupableRow {
  name: string;
  type?: AssignmentType;
  dueDate: string;
  /** Rows generated by one use of the repeat control share this tag. */
  seriesSeed: string | null;
  /** The interval that generation used. */
  seriesWeeks: number | null;
}

export interface RowOccurrence {
  name: string;
  type?: AssignmentType;
  dueDate: string;
}

export interface GroupedRows {
  series: { intervalWeeks: number; occurrences: RowOccurrence[] }[];
  singles: RowOccurrence[];
}

/**
 * Sort saved grid rows into repeating groups and one-off rows.
 *
 * The grid fills itself with repeats up front so they can be edited before
 * saving, which means by save time a group may have been renamed, re-dated,
 * reordered around or partly deleted. Grouping therefore goes by the tag the
 * rows carry, not by anything re-derived from their dates — the dates are
 * exactly what the user may have changed.
 *
 * A group worn down to a single surviving row is demoted back to a one-off: a
 * "series" of one is just an assignment with extra bookkeeping, and main rejects
 * it anyway. Order is preserved throughout, so a group's position in the grid
 * becomes its series order.
 */
export function groupIntoSeries(rows: GroupableRow[]): GroupedRows {
  const occurrence = (r: GroupableRow): RowOccurrence => ({
    name: r.name.trim(),
    type: r.type,
    dueDate: r.dueDate,
  });

  const groups = new Map<string, GroupableRow[]>();
  const singles: RowOccurrence[] = [];

  for (const row of rows) {
    if (!row.seriesSeed) {
      singles.push(occurrence(row));
      continue;
    }
    const existing = groups.get(row.seriesSeed);
    if (existing) existing.push(row);
    else groups.set(row.seriesSeed, [row]);
  }

  const series: GroupedRows['series'] = [];
  for (const members of groups.values()) {
    if (members.length < 2) {
      singles.push(...members.map(occurrence));
      continue;
    }
    series.push({
      intervalWeeks: members[0].seriesWeeks ?? 1,
      occurrences: members.map(occurrence),
    });
  }

  return { series, singles };
}

// ─── Renaming a series ────────────────────────────────────────────────────────

export interface SeriesRename {
  index: number;
  name: string;
}

/**
 * Work out what every occurrence should be called after a rename applied across
 * a series.
 *
 * A rename is not a find-and-replace: occurrences are numbered, so setting all
 * seven to the literal text typed into the third one would produce seven rows
 * called "Problem Set 3". What the user means is "the stem changed" — so the
 * stem is taken from what they typed and each occurrence keeps a number of its
 * own, counted in series order.
 *
 * The number they typed anchors the sequence. Renaming occurrence 3 to
 * "Problem Set 3" numbers the series 1…7, and so does typing "Problem Set" with
 * no number at all, since the anchor then stands in for its own position. Typing
 * a number low enough to push the first occurrence below 1 (say "HW 1" on
 * occurrence 5) clamps the sequence to start at 1 rather than running negative;
 * the series comes out cleanly numbered, which is the likely intent anyway.
 *
 * Numbering follows the same convention as generateRepeats, so a series renamed
 * here and then extended continues where it left off.
 */
export function seriesRenames(
  typedName: string,
  anchorIndex: number,
  indices: number[],
): SeriesRename[] {
  const typed = typedName.trim();
  const match = typed.match(/^(.*?)(\d+)\s*$/);
  const stem = (match ? match[1] : typed).trimEnd();

  // Nothing to hang a number on — a name that is only digits, or empty. Give
  // every occurrence the text as typed rather than inventing " 1", " 2".
  if (!stem) return indices.map(index => ({ index, name: typed }));

  const base = match ? parseInt(match[2], 10) : anchorIndex;
  const first = Math.max(1, base - (anchorIndex - 1));

  return indices.map(index => ({ index, name: `${stem} ${first + index - 1}` }));
}

// ─── Spotting series that were never linked ───────────────────────────────────
// Everything added before series existed — and anything an importer creates —
// lands as unrelated rows. They often ARE a series, and the evidence is right
// there in the data: the same name stem, evenly spaced a whole number of weeks
// apart. This finds those so the UI can offer to link them. It only ever
// proposes; nothing is linked without the user saying so.

/** A row as the detector needs it. */
export interface DetectableRow {
  id: string;
  name: string;
  dueDate: string;
}

export interface LinkCandidate {
  /** The shared name stem ("Homework"), for describing the group to the user. */
  stem: string;
  intervalWeeks: number;
  /** In date order, which is the order they would be numbered in. */
  members: DetectableRow[];
}

/**
 * Three, not two. Any two dates are "evenly spaced", so a pair proves nothing —
 * two essays that happen to be a week apart would be offered as a series. Three
 * in a row at the same interval is a pattern.
 */
export const MIN_LINK_CANDIDATES = 3;

/** Beyond a month apart it isn't a repeating schedule, it's a coincidence. */
export const MAX_LINK_INTERVAL_WEEKS = 4;

/** Whole days between two YYYY-MM-DD dates. Rounded, because a DST boundary
 *  makes one of the days 23 or 25 hours long and the raw division 6.96. */
function daysBetween(from: string, to: string): number {
  const ms = parseDateLocal(to).getTime() - parseDateLocal(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** The name with any trailing number stripped: "Homework 7" → "Homework". */
function nameStem(name: string): string {
  const match = name.trim().match(/^(.*?)(\d+)\s*$/);
  return (match ? match[1] : name).trim();
}

/**
 * Find groups of unlinked rows that look like they were meant to be a series.
 *
 * Rows are grouped by name stem, sorted by date, and scanned for the longest
 * runs at a single weekly interval. A run is only proposed once it reaches
 * MIN_LINK_CANDIDATES, and a row never appears in two candidates — linking it
 * twice is not a thing that can happen, so offering it twice would be a lie.
 *
 * Callers pass only rows that have no series yet; this does not check.
 */
export function detectSeriesCandidates(rows: DetectableRow[]): LinkCandidate[] {
  const byStem = new Map<string, DetectableRow[]>();
  for (const row of rows) {
    const stem = nameStem(row.name);
    // A name that is only a number has no stem to group on.
    if (!stem) continue;
    const existing = byStem.get(stem);
    if (existing) existing.push(row);
    else byStem.set(stem, [row]);
  }

  const candidates: LinkCandidate[] = [];
  for (const [stem, group] of byStem) {
    if (group.length < MIN_LINK_CANDIDATES) continue;
    // YYYY-MM-DD sorts correctly as text.
    const items = [...group].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    let start = 0;
    while (start < items.length - 1) {
      const gap = daysBetween(items[start].dueDate, items[start + 1].dueDate);
      const weeks = gap / 7;
      if (gap <= 0 || !Number.isInteger(weeks) || weeks > MAX_LINK_INTERVAL_WEEKS) {
        start++;
        continue;
      }

      let end = start + 1;
      while (end + 1 < items.length && daysBetween(items[end].dueDate, items[end + 1].dueDate) === gap) {
        end++;
      }

      const run = items.slice(start, end + 1);
      if (run.length >= MIN_LINK_CANDIDATES) {
        candidates.push({ stem, intervalWeeks: weeks, members: run });
        // Consumed — the next run starts after it, so no row is offered twice.
        start = end + 1;
      } else {
        // Too short to propose; the row that ended it may still start the next run.
        start = end;
      }
    }
  }

  return candidates.sort((a, b) => a.members[0].dueDate.localeCompare(b.members[0].dueDate));
}
