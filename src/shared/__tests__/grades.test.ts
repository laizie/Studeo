import { describe, it, expect } from 'vitest';
import { parseGradeWeights, computeCourseStanding, formatPercent } from '../grades';
import type { Assignment, AssignmentType } from '../types';

let counter = 0;
function graded(type: AssignmentType, score: number | null, possible: number | null): Assignment {
  counter += 1;
  return {
    id: `a${counter}`,
    course_id: 'c1',
    name: `${type} ${counter}`,
    type,
    status: 'completed',
    due_date: '2026-03-01',
    notes: null,
    score,
    points_possible: possible,
    created_at: '2026-01-01T00:00:00Z',
  };
}

// ── parseGradeWeights ──────────────────────────────────────────────────────────

describe('parseGradeWeights', () => {
  it('parses a valid scheme', () => {
    expect(parseGradeWeights('{"Homework": 30, "Exam": 40}')).toEqual({
      Homework: 30,
      Exam: 40,
    });
  });

  it('returns empty for null, malformed JSON, and non-objects', () => {
    expect(parseGradeWeights(null)).toEqual({});
    expect(parseGradeWeights('not json')).toEqual({});
    expect(parseGradeWeights('[30, 40]')).toEqual({});
    expect(parseGradeWeights('"Homework"')).toEqual({});
  });

  it('drops unknown types and invalid weights', () => {
    expect(
      parseGradeWeights('{"Homework": 30, "Attendance": 10, "Exam": "forty", "Quiz": -5, "Lab": 0}')
    ).toEqual({ Homework: 30 });
  });
});

// ── computeCourseStanding ──────────────────────────────────────────────────────

describe('computeCourseStanding', () => {
  it('returns null percent when nothing is graded', () => {
    const result = computeCourseStanding([graded('Homework', null, null)], null);
    expect(result.percent).toBeNull();
    expect(result.gradedCount).toBe(0);
  });

  it('ignores assignments with zero points possible', () => {
    const result = computeCourseStanding([graded('Homework', 5, 0)], null);
    expect(result.percent).toBeNull();
  });

  it('uses straight points when no scheme is set', () => {
    const result = computeCourseStanding(
      [graded('Homework', 18, 20), graded('Exam', 70, 100)],
      null
    );
    // (18 + 70) / (20 + 100) = 73.33%
    expect(result.percent).toBeCloseTo(73.333, 2);
    expect(result.gradedCount).toBe(2);
  });

  it('applies type weights when a scheme is set', () => {
    const result = computeCourseStanding(
      [graded('Homework', 18, 20), graded('Exam', 70, 100)],
      '{"Homework": 30, "Exam": 70}'
    );
    // HW 90% * 30 + Exam 70% * 70, over 100 = 76%
    expect(result.percent).toBeCloseTo(76, 5);
  });

  it('normalizes over graded categories only — an ungraded category does not drag', () => {
    const result = computeCourseStanding(
      [graded('Homework', 18, 20)],
      '{"Homework": 30, "Exam": 70}'
    );
    // Only HW graded: standing is HW's 90%, not 27%.
    expect(result.percent).toBeCloseTo(90, 5);
  });

  it('pools points within a type before weighting', () => {
    const result = computeCourseStanding(
      [graded('Quiz', 8, 10), graded('Quiz', 2, 10)],
      '{"Quiz": 100}'
    );
    // (8+2)/(10+10) = 50%, not the 65% average of 80% and 20%.
    expect(result.percent).toBeCloseTo(50, 5);
  });

  it('gives weight 0 to graded types missing from the scheme', () => {
    const result = computeCourseStanding(
      [graded('Homework', 20, 20), graded('Reading', 0, 10)],
      '{"Homework": 100}'
    );
    expect(result.percent).toBeCloseTo(100, 5);
    const reading = result.breakdown.find(b => b.type === 'Reading');
    expect(reading?.weight).toBeNull();
  });

  it('falls back to straight points when the scheme covers nothing graded', () => {
    const result = computeCourseStanding(
      [graded('Reading', 9, 10)],
      '{"Exam": 100}'
    );
    expect(result.percent).toBeCloseTo(90, 5);
  });

  it('reports a per-type breakdown', () => {
    const result = computeCourseStanding(
      [graded('Homework', 18, 20), graded('Homework', 16, 20), graded('Exam', 85, 100)],
      '{"Homework": 40, "Exam": 60}'
    );
    expect(result.breakdown).toContainEqual({
      type: 'Homework', earned: 34, possible: 40, percent: 85, weight: 40,
    });
    expect(result.breakdown).toContainEqual({
      type: 'Exam', earned: 85, possible: 100, percent: 85, weight: 60,
    });
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
