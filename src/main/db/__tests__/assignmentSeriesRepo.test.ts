import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import { createCourse } from '../repositories/courseRepo';
import {
  getAssignment,
  listAssignments,
  createAssignment,
  updateAssignment,
  listBySeries,
  setDates,
  shiftAssignments,
} from '../repositories/assignmentRepo';
import {
  listAssignmentSeries,
  getAssignmentSeries,
  createAssignmentSeries,
  extendAssignmentSeries,
  deleteAssignmentSeries,
} from '../repositories/assignmentSeriesRepo';
import { createSubtask, listSubtasks } from '../repositories/subtaskRepo';

let courseId: string;

beforeEach(() => {
  mockDb.current = createTestDb();
  courseId = createCourse({ name: 'CS 101', abbreviation: 'CS', color: '#abc' }).id;
});

/** A weekly series of four: Mar 6, 13, 20, 27 (all Fridays). */
function weeklySeries() {
  return createAssignmentSeries({
    courseId,
    name: 'Homework 1',
    type: 'Homework',
    anchorDate: '2026-03-06',
    untilDate: '2026-03-27',
    intervalWeeks: 1,
  });
}

describe('createAssignmentSeries', () => {
  it('creates the rule and its occurrences together', () => {
    const { series, assignments } = weeklySeries();

    expect(series.name_template).toBe('Homework 1');
    expect(series.interval_weeks).toBe(1);
    expect(assignments).toHaveLength(4);
    expect(assignments.map(a => a.due_date)).toEqual([
      '2026-03-06', '2026-03-13', '2026-03-20', '2026-03-27',
    ]);
  });

  it('numbers the occurrences and indexes them from 1', () => {
    const { series, assignments } = weeklySeries();

    expect(assignments.map(a => a.name)).toEqual([
      'Homework 1', 'Homework 2', 'Homework 3', 'Homework 4',
    ]);
    expect(assignments.map(a => a.series_index)).toEqual([1, 2, 3, 4]);
    expect(assignments.every(a => a.series_id === series.id)).toBe(true);
  });

  it('carries the type and due time onto every occurrence', () => {
    const { assignments } = createAssignmentSeries({
      courseId,
      name: 'Quiz 1',
      type: 'Quiz',
      anchorDate: '2026-03-06',
      untilDate: '2026-03-20',
      intervalWeeks: 1,
      dueTime: '23:59',
    });

    expect(assignments.every(a => a.type === 'Quiz')).toBe(true);
    expect(assignments.every(a => a.due_time === '23:59')).toBe(true);
  });

  it('lists series by course', () => {
    weeklySeries();
    expect(listAssignmentSeries({ courseId })).toHaveLength(1);
    expect(listAssignmentSeries({ courseId: 'nope' })).toEqual([]);
  });

  it('rolls back the occurrences if the series row fails', () => {
    expect(() =>
      createAssignmentSeries({
        courseId: 'no-such-course', // violates the FK
        name: 'Homework 1',
        anchorDate: '2026-03-06',
        untilDate: '2026-03-27',
        intervalWeeks: 1,
      }),
    ).toThrow();

    // The point of the transaction: no half-saved semester left behind.
    expect(listAssignments()).toEqual([]);
    expect(listAssignmentSeries()).toEqual([]);
  });
});

describe('shiftAssignments', () => {
  it('moves only the anchor under scope "one"', () => {
    const { assignments } = weeklySeries();

    const result = shiftAssignments({ assignmentId: assignments[1].id, scope: 'one', days: 7 });

    expect(result.changed).toEqual([
      { id: assignments[1].id, from: '2026-03-13', to: '2026-03-20' },
    ]);
    expect(listBySeries(assignments[0].series_id!).map(a => a.due_date)).toEqual([
      '2026-03-06', '2026-03-20', '2026-03-20', '2026-03-27',
    ]);
  });

  it('moves the anchor and everything after it under "this_and_later"', () => {
    const { assignments } = weeklySeries();

    const result = shiftAssignments({
      assignmentId: assignments[1].id,
      scope: 'this_and_later',
      days: 7,
    });

    expect(result.changed).toHaveLength(3);
    expect(listBySeries(assignments[0].series_id!).map(a => a.due_date)).toEqual([
      '2026-03-06', '2026-03-20', '2026-03-27', '2026-04-03',
    ]);
  });

  it('moves every occurrence under "all"', () => {
    const { assignments } = weeklySeries();

    shiftAssignments({ assignmentId: assignments[2].id, scope: 'all', days: -1 });

    expect(listBySeries(assignments[0].series_id!).map(a => a.due_date)).toEqual([
      '2026-03-05', '2026-03-12', '2026-03-19', '2026-03-26',
    ]);
  });

  it('pulls dates earlier for a negative shift', () => {
    const { assignments } = weeklySeries();

    const result = shiftAssignments({ assignmentId: assignments[0].id, scope: 'one', days: -7 });

    expect(result.changed[0].to).toBe('2026-02-27');
  });

  it('counts "later" by series position, not by date', () => {
    const { assignments } = weeklySeries();
    // Drag occurrence 2 past occurrence 4 by hand. By date it is now last; by
    // series position it is still second, and that is what the scope must use.
    updateAssignment(assignments[1].id, { dueDate: '2026-04-10' });

    const result = shiftAssignments({
      assignmentId: assignments[1].id,
      scope: 'this_and_later',
      days: 7,
    });

    expect(result.changed.map(c => c.id)).toEqual([
      assignments[1].id, assignments[2].id, assignments[3].id,
    ]);
  });

  it('leaves completed and graded occurrences where they are', () => {
    const { assignments } = weeklySeries();
    updateAssignment(assignments[1].id, { status: 'completed' });
    updateAssignment(assignments[2].id, { score: 18, pointsPossible: 20 });

    const result = shiftAssignments({
      assignmentId: assignments[0].id,
      scope: 'all',
      days: 7,
    });

    expect(result.changed.map(c => c.id)).toEqual([assignments[0].id, assignments[3].id]);
    expect(result.skipped).toEqual([
      { id: assignments[1].id, name: 'Homework 2', reason: 'completed' },
      { id: assignments[2].id, name: 'Homework 3', reason: 'graded' },
    ]);
    // Finished work kept its original date.
    expect(getAssignment(assignments[1].id)!.due_date).toBe('2026-03-13');
    expect(getAssignment(assignments[2].id)!.due_date).toBe('2026-03-20');
  });

  it('still moves the anchor when the anchor itself is finished', () => {
    const { assignments } = weeklySeries();
    updateAssignment(assignments[0].id, { status: 'completed' });

    // The user pointed at this row and asked for it to move; only the collateral
    // rows get protected.
    const result = shiftAssignments({ assignmentId: assignments[0].id, scope: 'one', days: 7 });

    expect(result.changed).toHaveLength(1);
    expect(getAssignment(assignments[0].id)!.due_date).toBe('2026-03-13');
  });

  it('treats a one-off assignment as only itself, whatever the scope', () => {
    const solo = createAssignment({ courseId, name: 'Essay', dueDate: '2026-03-06' });

    const result = shiftAssignments({ assignmentId: solo.id, scope: 'all', days: 7 });

    expect(result.changed).toEqual([{ id: solo.id, from: '2026-03-06', to: '2026-03-13' }]);
  });

  it('throws for an assignment that does not exist', () => {
    expect(() => shiftAssignments({ assignmentId: 'nope', scope: 'one', days: 7 })).toThrow(
      /not found/i,
    );
  });

  it('round-trips through setDates, which is how Undo works', () => {
    const { assignments } = weeklySeries();
    // Move one occurrence by hand first, so the series has uneven dates and a
    // blanket "shift back by 7" would NOT restore it correctly.
    updateAssignment(assignments[2].id, { dueDate: '2026-03-18' });
    const before = listBySeries(assignments[0].series_id!).map(a => a.due_date);

    const result = shiftAssignments({
      assignmentId: assignments[0].id,
      scope: 'all',
      days: 7,
    });
    setDates(result.changed.map(c => ({ id: c.id, dueDate: c.from })));

    expect(listBySeries(assignments[0].series_id!).map(a => a.due_date)).toEqual(before);
  });
});

describe('setDates', () => {
  it('writes several dates at once and reports the count', () => {
    const { assignments } = weeklySeries();

    const count = setDates([
      { id: assignments[0].id, dueDate: '2026-04-01' },
      { id: assignments[1].id, dueDate: '2026-04-02' },
    ]);

    expect(count).toBe(2);
    expect(getAssignment(assignments[0].id)!.due_date).toBe('2026-04-01');
    expect(getAssignment(assignments[1].id)!.due_date).toBe('2026-04-02');
  });

  it('is a no-op for an empty batch', () => {
    expect(setDates([])).toBe(0);
  });

  it('leaves everything else on the row alone', () => {
    const { assignments } = weeklySeries();
    updateAssignment(assignments[0].id, { status: 'completed', score: 9, pointsPossible: 10 });
    const before = getAssignment(assignments[0].id)!;

    setDates([{ id: assignments[0].id, dueDate: '2026-04-01' }]);
    const after = getAssignment(assignments[0].id)!;

    expect(after.due_date).toBe('2026-04-01');
    expect(after.status).toBe('completed');
    expect(after.score).toBe(9);
    expect(after.completed_at).toBe(before.completed_at);
  });
});

describe('extendAssignmentSeries', () => {
  it('appends the occurrences that fit the later end date', () => {
    const { series, assignments } = weeklySeries();

    const { assignments: added } = extendAssignmentSeries({
      seriesId: series.id,
      untilDate: '2026-04-10',
    });

    expect(added.map(a => a.due_date)).toEqual(['2026-04-03', '2026-04-10']);
    expect(added.map(a => a.name)).toEqual(['Homework 5', 'Homework 6']);
    expect(added.map(a => a.series_index)).toEqual([5, 6]);
    expect(listBySeries(series.id)).toHaveLength(assignments.length + 2);
  });

  it('records the new end date on the rule', () => {
    const { series } = weeklySeries();

    extendAssignmentSeries({ seriesId: series.id, untilDate: '2026-04-10' });

    expect(getAssignmentSeries(series.id)!.until_date).toBe('2026-04-10');
  });

  it('continues from the last occurrence, not from the anchor', () => {
    const { series, assignments } = weeklySeries();
    // The last occurrence slipped a week by hand; the extension should follow the
    // rows as they actually are rather than recompute from the original rule.
    updateAssignment(assignments[3].id, { dueDate: '2026-04-03' });

    const { assignments: added } = extendAssignmentSeries({
      seriesId: series.id,
      untilDate: '2026-04-17',
    });

    expect(added.map(a => a.due_date)).toEqual(['2026-04-10', '2026-04-17']);
  });

  it('throws for a series that does not exist', () => {
    expect(() => extendAssignmentSeries({ seriesId: 'nope', untilDate: '2026-04-10' })).toThrow(
      /not found/i,
    );
  });
});

describe('deleteAssignmentSeries', () => {
  it('drops the rule and keeps every occurrence', () => {
    const { series, assignments } = weeklySeries();

    deleteAssignmentSeries(series.id);

    expect(getAssignmentSeries(series.id)).toBeNull();
    expect(listAssignments({ courseId })).toHaveLength(assignments.length);
  });

  it('clears both series columns, leaving no orphaned position', () => {
    const { series, assignments } = weeklySeries();

    deleteAssignmentSeries(series.id);

    const rows = listAssignments({ courseId });
    expect(rows.every(a => a.series_id === null)).toBe(true);
    expect(rows.every(a => a.series_index === null)).toBe(true);
    // Still the same rows, under the same ids.
    expect(rows.map(a => a.id).sort()).toEqual(assignments.map(a => a.id).sort());
  });

  it('keeps grades, status and steps on the surviving occurrences', () => {
    const { series, assignments } = weeklySeries();
    updateAssignment(assignments[0].id, { status: 'completed', score: 18, pointsPossible: 20 });
    createSubtask({ assignmentId: assignments[0].id, name: 'Outline' });

    deleteAssignmentSeries(series.id);

    const survivor = getAssignment(assignments[0].id)!;
    expect(survivor.status).toBe('completed');
    expect(survivor.score).toBe(18);
    expect(listSubtasks({ assignmentId: assignments[0].id })).toHaveLength(1);
  });

  it('takes its series with it when the course is deleted', () => {
    // The series row hangs off the course, so the course cascade has to reach it
    // — otherwise a deleted course leaves rules pointing at nothing.
    const { series } = weeklySeries();
    mockDb.current!.prepare('DELETE FROM courses WHERE id = ?').run(courseId);

    expect(getAssignmentSeries(series.id)).toBeNull();
    expect(listAssignments()).toEqual([]);
  });
});
