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
