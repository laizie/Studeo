// Pure grade math — no Electron/Node imports so this is usable everywhere
// and unit-testable. The course standing is always COMPUTED from assignment
// scores; it is never stored (derived-values rule in CLAUDE.md).

import { ASSIGNMENT_TYPES } from './types';
import type { Assignment, AssignmentType } from './types';

/** Assignment type → weight percent, e.g. { Homework: 30, Exam: 40 }. */
export type GradeWeights = Partial<Record<AssignmentType, number>>;

/**
 * Parse the courses.grade_weights JSON column. Malformed JSON, unknown types,
 * and non-numeric or negative weights are dropped rather than thrown — a bad
 * config should never crash a page.
 */
export function parseGradeWeights(raw: string | null): GradeWeights {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const out: GradeWeights = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (
      (ASSIGNMENT_TYPES as string[]).includes(key) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > 0
    ) {
      out[key as AssignmentType] = value;
    }
  }
  return out;
}

export interface TypeStanding {
  type: AssignmentType;
  earned: number;
  possible: number;
  /** 0–100 within this type. */
  percent: number;
  /** Configured weight, or null when no scheme covers this type. */
  weight: number | null;
}

export interface CourseStanding {
  /** Weighted current grade, 0–100 — or null when nothing is graded yet. */
  percent: number | null;
  gradedCount: number;
  /** Per-type breakdown, only for types with at least one graded assignment. */
  breakdown: TypeStanding[];
}

function isGraded(a: Assignment): boolean {
  return a.score !== null && a.points_possible !== null && a.points_possible > 0;
}

/**
 * Current standing in a course, from whatever has been graded so far.
 *
 * With no weight scheme: straight points — total earned / total possible.
 *
 * With a scheme ({ Homework: 30, Exam: 40 }): each type's percent is averaged
 * by points within the type, then types are combined by weight — normalized
 * over the weights of types that HAVE grades, so an ungraded category doesn't
 * drag the standing down before anything in it is returned. Graded types
 * missing from the scheme count for nothing (weight 0), matching how a
 * syllabus weight table works.
 */
export function computeCourseStanding(
  assignments: Assignment[],
  rawWeights: string | null,
): CourseStanding {
  const graded = assignments.filter(isGraded);
  if (graded.length === 0) return { percent: null, gradedCount: 0, breakdown: [] };

  const weights = parseGradeWeights(rawWeights);
  const hasScheme = Object.keys(weights).length > 0;

  // Group earned/possible by type.
  const byType = new Map<AssignmentType, { earned: number; possible: number }>();
  for (const a of graded) {
    const t = byType.get(a.type) ?? { earned: 0, possible: 0 };
    t.earned += a.score!;
    t.possible += a.points_possible!;
    byType.set(a.type, t);
  }

  const breakdown: TypeStanding[] = [...byType.entries()].map(([type, t]) => ({
    type,
    earned: t.earned,
    possible: t.possible,
    percent: (t.earned / t.possible) * 100,
    weight: hasScheme ? weights[type] ?? null : null,
  }));

  let percent: number;
  const weighted = breakdown.filter(b => b.weight !== null && b.weight > 0);
  if (hasScheme && weighted.length > 0) {
    const totalWeight = weighted.reduce((sum, b) => sum + b.weight!, 0);
    percent = weighted.reduce((sum, b) => sum + b.percent * b.weight!, 0) / totalWeight;
  } else {
    // No scheme, or the scheme covers nothing graded yet: straight points.
    const earned = graded.reduce((sum, a) => sum + a.score!, 0);
    const possible = graded.reduce((sum, a) => sum + a.points_possible!, 0);
    percent = (earned / possible) * 100;
  }

  return { percent, gradedCount: graded.length, breakdown };
}

/** "91.2%" — one decimal, trailing .0 trimmed. */
export function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

// ─── Target-grade calculator ────────────────────────────────────────────────
// The inverse of computeCourseStanding: given the grade locked in so far and
// the share of the grade still up for grabs, what average do you need on the
// remaining work to finish at a target? Pure + unit-tested like the rest.

export type TargetStatus =
  | 'reachable'  // a normal 0–100 score gets you there
  | 'impossible' // would need more than 100% on what's left
  | 'secured'    // even a 0 on the rest keeps you at/above target
  | 'locked';    // nothing left ungraded — the grade is already final

export interface TargetGradeResult {
  /** Average % needed across the remaining work to hit the target. */
  neededAverage: number;
  status: TargetStatus;
}

/**
 * What average is needed on the remaining work to finish a course at
 * `targetPercent`?
 *
 * `remainingWeightPct` is the share of the WHOLE course grade (0–100) that is
 * still ungraded; the rest (100 − remaining) is locked in at `currentPercent`.
 * Solving `target = current·(locked/100) + needed·(remaining/100)` for needed:
 *
 *     needed = (target·100 − current·(100 − remaining)) / remaining
 *
 * which is exactly the inverse of the weighted standing the course page shows.
 */
export function computeTargetGrade(
  currentPercent: number,
  remainingWeightPct: number,
  targetPercent: number,
): TargetGradeResult {
  const w = remainingWeightPct;
  // Nothing left to earn on (or a nonsensical weight): the grade is settled.
  if (!Number.isFinite(w) || w <= 0) {
    return { neededAverage: 0, status: 'locked' };
  }

  const current = Number.isFinite(currentPercent) ? currentPercent : 0;
  const lockedShare = Math.max(0, 100 - w); // clamp so remaining > 100 still behaves
  const needed = (targetPercent * 100 - current * lockedShare) / w;

  let status: TargetStatus = 'reachable';
  if (needed <= 0) status = 'secured';
  else if (needed > 100) status = 'impossible';

  return { neededAverage: needed, status };
}

/**
 * The share of the course grade (0–100) that is still ungraded, for prefilling
 * the calculator from the course's weight scheme: the summed weight of types
 * with no grades yet, over the total of all scheme weights. Returns null when
 * there is no usable scheme (so the UI falls back to a manual entry).
 */
export function remainingWeightShare(
  weights: GradeWeights,
  gradedTypes: Iterable<AssignmentType>,
): number | null {
  const entries = Object.entries(weights) as [AssignmentType, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;

  const graded = new Set(gradedTypes);
  const remaining = entries
    .filter(([type]) => !graded.has(type))
    .reduce((sum, [, w]) => sum + w, 0);

  return (remaining / total) * 100;
}
