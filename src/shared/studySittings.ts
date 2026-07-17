import type { StudySession } from './types';
import { localDayKey } from './studyStats';

// A *sitting* is what a student actually means by "a study session": one stretch at
// the desk, not each individual Pomodoro block inside it. The timer logs a row per
// focus block (25 min, 25 min, 25 min…), which is the honest raw record — but
// listing those back reads as five identical 25-minute sessions rather than the one
// two-hour afternoon they really were.
//
// So sittings are *derived*, never stored (per CLAUDE.md): fold the logged blocks
// back together here at display time. The raw rows stay untouched, which means the
// gap rule below can change without a migration.

/**
 * How long a break may run before the next focus block counts as a new sitting.
 * An hour is chosen to cover the things you do mid-session and come back from —
 * lunch, a lecture, a walk — while a genuine "done for now" gap starts fresh.
 */
export const SITTING_GAP_MS = 60 * 60 * 1000;

export interface Sitting {
  /**
   * The first block's id. Per-sitting notes hang off this anchor, so a sitting has
   * one stable notes thread even as later blocks are folded into it.
   */
  id: string;
  startedAt: Date;
  /** When the last block in the sitting finished. */
  endedAt: Date;
  /** Seconds actually focused — the breaks *between* blocks are not counted. */
  focusSeconds: number;
  /** Wall-clock span start→end, including the breaks. Always ≥ focusSeconds. */
  elapsedSeconds: number;
  /** The raw focus blocks, in the order they happened. */
  blocks: StudySession[];
}

function endOf(block: StudySession): number {
  return new Date(block.started_at).getTime() + block.duration_seconds * 1000;
}

/**
 * Fold logged focus blocks into sittings: consecutive blocks separated by no more
 * than `gapMs` of wall clock belong to the same one. Breaks are ignored as rows —
 * what matters is the silence between the end of one focus block and the start of
 * the next, which is the same whether the user took a logged break or just walked
 * away. Returns oldest-first; blocks that aren't `kind === 'focus'` are skipped.
 *
 * A sitting is deliberately allowed to cross midnight — 11pm→1am was one sitting,
 * and calling it two would be the calendar lying about the evening. Day bucketing
 * is a separate concern (see `sittingsByDay`).
 */
export function groupIntoSittings(
  sessions: StudySession[],
  gapMs: number = SITTING_GAP_MS,
): Sitting[] {
  const blocks = sessions
    .filter((s) => s.kind === 'focus')
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const sittings: Sitting[] = [];

  for (const block of blocks) {
    const startedAt = new Date(block.started_at);
    const endedAt   = new Date(endOf(block));
    const open      = sittings[sittings.length - 1];

    if (open && startedAt.getTime() - open.endedAt.getTime() <= gapMs) {
      // Overlapping or out-of-order rows must never shorten a sitting, so the end
      // only ever moves forward.
      if (endedAt.getTime() > open.endedAt.getTime()) open.endedAt = endedAt;
      open.focusSeconds   += block.duration_seconds;
      open.elapsedSeconds  = (open.endedAt.getTime() - open.startedAt.getTime()) / 1000;
      open.blocks.push(block);
    } else {
      sittings.push({
        id:             block.id,
        startedAt,
        endedAt,
        focusSeconds:   block.duration_seconds,
        elapsedSeconds: block.duration_seconds,
        blocks:         [block],
      });
    }
  }

  return sittings;
}

export interface SittingDay {
  /** Local YYYY-MM-DD. */
  key: string;
  date: Date;
  sittings: Sitting[];
  /** Focus seconds across every sitting filed under this day. */
  focusSeconds: number;
}

/**
 * Bucket sittings under the local day they *began*, newest day first (and newest
 * sitting first within each day) — the order a "recent sessions" list wants.
 * A sitting that ran past midnight files under the evening it started, which is
 * where the student would go looking for it.
 */
export function sittingsByDay(sittings: Sitting[]): SittingDay[] {
  const days = new Map<string, SittingDay>();

  for (const sitting of sittings) {
    const key = localDayKey(sitting.startedAt);
    let day = days.get(key);
    if (!day) {
      day = { key, date: sitting.startedAt, sittings: [], focusSeconds: 0 };
      days.set(key, day);
    }
    day.sittings.push(sitting);
    day.focusSeconds += sitting.focusSeconds;
  }

  const ordered = [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
  for (const day of ordered) {
    day.sittings.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  return ordered;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'late night';

/**
 * Which part of the day a sitting began in — enough to tell this afternoon's stretch
 * from tonight's when nothing else distinguishes them. The boundaries are the ordinary
 * human ones rather than even quarters, and "late night" deliberately runs until 5am:
 * a 1am session belongs to the night it started in, not to the next morning.
 */
export function timeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5  && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'late night';
}

/**
 * The intentions the user set across a sitting's blocks — deduped and in order, so
 * one row can say what the whole stretch was for without repeating "essay" ×5.
 */
export function sittingIntentions(sitting: Sitting): string[] {
  const seen = new Set<string>();
  for (const block of sitting.blocks) {
    const text = block.intention?.trim();
    if (text) seen.add(text);
  }
  return [...seen];
}

/** The last reflection written in a sitting — how the stretch ended. */
export function lastReflection(sitting: Sitting): string | null {
  for (let i = sitting.blocks.length - 1; i >= 0; i--) {
    const text = sitting.blocks[i].reflection?.trim();
    if (text) return text;
  }
  return null;
}
