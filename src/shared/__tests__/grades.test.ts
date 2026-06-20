import { describe, it, expect } from 'vitest';
import {
  parseGradeSections,
  computeSectionStanding,
  formatPercent,
  computeTargetGrade,
} from '../grades';
import type { GradeSection } from '../types';

function section(name: string, weight: number, score: number | null): GradeSection {
  return { id: name, name, weight, score };
}

// ── parseGradeSections ──────────────────────────────────────────────────────────

describe('parseGradeSections', () => {
  it('parses the new array shape', () => {
    const raw = JSON.stringify([
      { id: 'a', name: 'Exam 1', weight: 20, score: 88 },
      { id: 'b', name: 'Final', weight: 30, score: null },
    ]);
    expect(parseGradeSections(raw)).toEqual([
      { id: 'a', name: 'Exam 1', weight: 20, score: 88 },
      { id: 'b', name: 'Final', weight: 30, score: null },
    ]);
  });

  it('reads the legacy { type: weight } object forward as sections with no score', () => {
    expect(parseGradeSections('{"Homework": 30, "Exam": 40}')).toEqual([
      { id: 'legacy-Homework', name: 'Homework', weight: 30, score: null },
      { id: 'legacy-Exam', name: 'Exam', weight: 40, score: null },
    ]);
  });

  it('drops invalid entries (bad name, non-positive weight, non-number score)', () => {
    const raw = JSON.stringify([
      { id: '1', name: 'Exam 1', weight: 20, score: 90 },
      { id: '2', name: '', weight: 10, score: null },     // empty name
      { id: '3', name: 'Lab', weight: 0, score: null },   // zero weight
      { id: '4', name: 'Quiz', weight: 10, score: 'x' },  // bad score → null
    ]);
    expect(parseGradeSections(raw)).toEqual([
      { id: '1', name: 'Exam 1', weight: 20, score: 90 },
      { id: '4', name: 'Quiz', weight: 10, score: null },
    ]);
  });

  it('returns [] for null and malformed JSON', () => {
    expect(parseGradeSections(null)).toEqual([]);
    expect(parseGradeSections('not json')).toEqual([]);
    expect(parseGradeSections('42')).toEqual([]);
  });
});

// ── computeSectionStanding ──────────────────────────────────────────────────────

describe('computeSectionStanding', () => {
  it('is null with the full remaining weight when nothing is scored', () => {
    const r = computeSectionStanding([section('Exam 1', 50, null), section('Final', 50, null)]);
    expect(r.currentPercent).toBeNull();
    expect(r.totalWeight).toBe(100);
    expect(r.scoredWeight).toBe(0);
    expect(r.remainingWeightPct).toBeCloseTo(100, 6);
  });

  it('averages scored sections normalized over their own weight', () => {
    // Exam 1 (20) at 90 and Homework (30) at 80; Final (50) blank.
    const r = computeSectionStanding([
      section('Exam 1', 20, 90),
      section('Homework', 30, 80),
      section('Final', 50, null),
    ]);
    // (90*20 + 80*30) / (20+30) = 4200/50 = 84
    expect(r.currentPercent).toBeCloseTo(84, 6);
    expect(r.scoredWeight).toBe(50);
    expect(r.remainingWeightPct).toBeCloseTo(50, 6); // Final's 50 of 100
  });

  it('normalizes even when weights do not sum to 100', () => {
    // Total 50; only Midterm (20) scored at 75 → current 75, remaining (30/50)=60%.
    const r = computeSectionStanding([
      section('Midterm', 20, 75),
      section('Paper', 30, null),
    ]);
    expect(r.currentPercent).toBeCloseTo(75, 6);
    expect(r.remainingWeightPct).toBeCloseTo(60, 6);
  });

  it('ignores sections with non-positive weight', () => {
    const r = computeSectionStanding([section('Exam', 100, 90), section('Bogus', 0, 50)]);
    expect(r.currentPercent).toBeCloseTo(90, 6);
    expect(r.totalWeight).toBe(100);
  });
});

// ── formatPercent ──────────────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('keeps one decimal when needed and trims .0', () => {
    expect(formatPercent(91.23)).toBe('91.2%');
    expect(formatPercent(90)).toBe('90%');
    expect(formatPercent(89.96)).toBe('90%');
    expect(formatPercent(100)).toBe('100%');
  });
});

// ── computeTargetGrade ──────────────────────────────────────────────────────────

describe('computeTargetGrade', () => {
  it('solves the needed average on the remaining work', () => {
    // 88% locked over 70% of the grade, final worth 30%, want 90 overall:
    // (90*100 - 88*70) / 30 = (9000 - 6160) / 30 = 94.666…
    const r = computeTargetGrade(88, 30, 90);
    expect(r.status).toBe('reachable');
    expect(r.neededAverage).toBeCloseTo(94.6667, 3);
  });

  it('is the exact inverse of the weighted standing', () => {
    // If you then score exactly the needed average on the remaining slice, the
    // weighted result equals the target.
    const current = 88, remaining = 30, target = 90;
    const { neededAverage } = computeTargetGrade(current, remaining, target);
    const finalGrade = current * ((100 - remaining) / 100) + neededAverage * (remaining / 100);
    expect(finalGrade).toBeCloseTo(target, 6);
  });

  it('flags a target already secured (a zero still keeps it)', () => {
    // 99% locked over 80%, only 20% left, want 70 → needed is negative.
    const r = computeTargetGrade(99, 20, 70);
    expect(r.status).toBe('secured');
    expect(r.neededAverage).toBeLessThanOrEqual(0);
  });

  it('flags an out-of-reach target (>100 needed)', () => {
    // 60% locked over 70%, final 30%, want 95 → needs way over 100.
    const r = computeTargetGrade(60, 30, 95);
    expect(r.status).toBe('impossible');
    expect(r.neededAverage).toBeGreaterThan(100);
  });

  it('treats no remaining weight as a locked grade', () => {
    expect(computeTargetGrade(85, 0, 90)).toEqual({ neededAverage: 0, status: 'locked' });
  });

  it('needs exactly the target when the whole grade is still open', () => {
    const r = computeTargetGrade(0, 100, 85);
    expect(r.status).toBe('reachable');
    expect(r.neededAverage).toBeCloseTo(85, 6);
  });
});
