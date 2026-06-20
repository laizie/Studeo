// Pure grade math — no Electron/Node imports so this is usable everywhere
// and unit-testable. The course standing is always COMPUTED from the grade
// sections; it is never stored (derived-values rule in CLAUDE.md).

import type { GradeSection } from './types';

/**
 * Parse the courses.grade_weights JSON column into grade sections. Tolerant by
 * design — a malformed config should never crash a page:
 *   - New shape: an array of { id, name, weight, score }.
 *   - Legacy shape: an object { "Homework": 30, … } (the old type→weight scheme)
 *     is read forward as sections with those names and no score yet.
 * Invalid entries (bad name/weight) are dropped.
 */
export function parseGradeSections(raw: string | null): GradeSection[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  // Legacy object form { type: weight } → sections, scores blank.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const out: GradeSection[] = [];
    for (const [name, weight] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
        out.push({ id: `legacy-${name}`, name, weight, score: null });
      }
    }
    return out;
  }

  if (!Array.isArray(parsed)) return [];

  const out: GradeSection[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, weight, score } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) continue;
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue;
    out.push({
      id: typeof id === 'string' && id ? id : `s-${out.length}`,
      name,
      weight,
      score: typeof score === 'number' && Number.isFinite(score) ? score : null,
    });
  }
  return out;
}

export interface SectionStanding {
  /** Weighted average over SCORED sections (normalized over their weight),
   *  or null when nothing is scored yet. */
  currentPercent: number | null;
  /** Sum of all section weights. */
  totalWeight: number;
  /** Sum of weights of sections that have a score. */
  scoredWeight: number;
  /** Share (0–100) of the total weight not yet scored — the still-open portion. */
  remainingWeightPct: number;
}

/**
 * Current standing from the grade sections, using the same "normalize over the
 * scored portion" rule the old type-based standing used — so an unscored Final
 * doesn't drag the grade down before you take it.
 */
export function computeSectionStanding(sections: GradeSection[]): SectionStanding {
  const valid = sections.filter(s => Number.isFinite(s.weight) && s.weight > 0);
  const totalWeight = valid.reduce((sum, s) => sum + s.weight, 0);

  const scored = valid.filter(s => s.score !== null && Number.isFinite(s.score));
  const scoredWeight = scored.reduce((sum, s) => sum + s.weight, 0);

  const currentPercent =
    scoredWeight > 0
      ? scored.reduce((sum, s) => sum + (s.score as number) * s.weight, 0) / scoredWeight
      : null;

  const remainingWeightPct =
    totalWeight > 0 ? ((totalWeight - scoredWeight) / totalWeight) * 100 : 0;

  return { currentPercent, totalWeight, scoredWeight, remainingWeightPct };
}

/** "91.2%" — one decimal, trailing .0 trimmed. */
export function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

// ─── Target-grade calculator ────────────────────────────────────────────────
// The inverse of computeSectionStanding: given the grade locked in so far and
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
