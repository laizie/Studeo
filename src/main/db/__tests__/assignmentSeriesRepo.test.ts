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
  setFields,
  shiftAssignments,
  applyToSeries,
} from '../repositories/assignmentRepo';
import {
  listAssignmentSeries,
  getAssignmentSeries,
  createAssignmentSeries,
  createAssignmentSeriesFromRows,
  createAssignmentBatch,
  linkIntoSeries,
  stopRepeatingFrom,
  restoreOccurrences,
  extendAssignmentSeries,
  deleteAssignmentSeries,
} from '../repositories/assignmentSeriesRepo';
import { createSubtask, listSubtasks } from '../repositories/subtaskRepo';
import { createStudyBlocks } from '../repositories/studyBlockRepo';
import { createNote } from '../repositories/noteRepo';
import { createNoteLink } from '../repositories/noteLinkRepo';

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

describe('createAssignmentSeriesFromRows', () => {
  it('inserts the occurrences verbatim, in the order given', () => {
    const { assignments } = createAssignmentSeriesFromRows({
      courseId,
      intervalWeeks: 1,
      occurrences: [
        { name: 'Lab 1', type: 'Lab', dueDate: '2026-03-06' },
        { name: 'Lab 2 (rescheduled)', type: 'Lab', dueDate: '2026-03-16' },
        { name: 'Lab 3', type: 'Lab', dueDate: '2026-03-20' },
      ],
    });

    expect(assignments.map(a => a.name)).toEqual([
      'Lab 1', 'Lab 2 (rescheduled)', 'Lab 3',
    ]);
    expect(assignments.map(a => a.due_date)).toEqual([
      '2026-03-06', '2026-03-16', '2026-03-20',
    ]);
    expect(assignments.map(a => a.series_index)).toEqual([1, 2, 3]);
  });

  it('reads the rule back off the rows rather than regenerating them', () => {
    const { series } = createAssignmentSeriesFromRows({
      courseId,
      intervalWeeks: 2,
      occurrences: [
        { name: 'Lab 1', type: 'Lab', dueDate: '2026-03-06' },
        { name: 'Lab 2', type: 'Lab', dueDate: '2026-03-16' },
      ],
    });

    expect(series.name_template).toBe('Lab 1');
    expect(series.type).toBe('Lab');
    expect(series.anchor_date).toBe('2026-03-06');
    expect(series.until_date).toBe('2026-03-16');
    expect(series.interval_weeks).toBe(2);
  });

  it("lets an occurrence's own type win over the series default", () => {
    const { assignments } = createAssignmentSeriesFromRows({
      courseId,
      intervalWeeks: 1,
      occurrences: [
        { name: 'Homework 1', type: 'Homework', dueDate: '2026-03-06' },
        { name: 'Quiz instead', type: 'Quiz', dueDate: '2026-03-13' },
      ],
    });

    expect(assignments.map(a => a.type)).toEqual(['Homework', 'Quiz']);
  });
});

describe('createAssignmentBatch', () => {
  const grid = () => ({
    series: [
      {
        courseId,
        intervalWeeks: 1,
        occurrences: [
          { name: 'Homework 1', type: 'Homework' as const, dueDate: '2026-03-06' },
          { name: 'Homework 2', type: 'Homework' as const, dueDate: '2026-03-13' },
          { name: 'Homework 3', type: 'Homework' as const, dueDate: '2026-03-20' },
        ],
      },
      {
        courseId,
        intervalWeeks: 2,
        occurrences: [
          { name: 'Lab 1', type: 'Lab' as const, dueDate: '2026-03-07' },
          { name: 'Lab 2', type: 'Lab' as const, dueDate: '2026-03-21' },
        ],
      },
    ],
    singles: [
      { courseId, name: 'Midterm', type: 'Exam' as const, dueDate: '2026-03-10' },
      { courseId, name: 'Final essay', type: 'Paper' as const, dueDate: '2026-04-30' },
    ],
  });

  it('writes every series and every one-off row in one go', () => {
    const result = createAssignmentBatch(grid());

    expect(result.series).toHaveLength(2);
    expect(result.assignments).toHaveLength(7);
    expect(listAssignments({ courseId })).toHaveLength(7);
  });

  it('keeps the two series apart', () => {
    const { series } = createAssignmentBatch(grid());
    const [homework, labs] = series;

    expect(homework.id).not.toBe(labs.id);
    expect(listBySeries(homework.id).map(a => a.name)).toEqual([
      'Homework 1', 'Homework 2', 'Homework 3',
    ]);
    expect(listBySeries(labs.id).map(a => a.name)).toEqual(['Lab 1', 'Lab 2']);
  });

  it('leaves the one-off rows unlinked', () => {
    createAssignmentBatch(grid());

    const singles = listAssignments({ courseId }).filter(a => a.series_id === null);
    expect(singles.map(a => a.name).sort()).toEqual(['Final essay', 'Midterm']);
    expect(singles.every(a => a.series_index === null)).toBe(true);
  });

  it('rolls the WHOLE grid back when any row fails', () => {
    const bad = grid();
    // A single pointing at a course that doesn't exist — the FK rejects it only
    // after both series have already been inserted.
    bad.singles.push({ courseId: 'no-such-course', name: 'Orphan', type: 'Exam', dueDate: '2026-05-01' });

    expect(() => createAssignmentBatch(bad)).toThrow();

    // This is the promise Day-One Setup makes: a failed save leaves nothing behind,
    // so you never have to work out which half of a syllabus landed.
    expect(listAssignments()).toEqual([]);
    expect(listAssignmentSeries()).toEqual([]);
  });

  it('accepts a grid of only one-off rows', () => {
    const result = createAssignmentBatch({ series: [], singles: grid().singles });

    expect(result.series).toEqual([]);
    expect(result.assignments).toHaveLength(2);
  });

  it('produces series that shift like any other', () => {
    // The whole point of the conversion: rows added through the grid can be moved
    // as a group afterwards, which the old createMany path made impossible.
    const { series } = createAssignmentBatch(grid());
    const occurrences = listBySeries(series[0].id);

    const result = shiftAssignments({
      assignmentId: occurrences[1].id,
      scope: 'this_and_later',
      days: 7,
    });

    expect(result.changed).toHaveLength(2);
    expect(listBySeries(series[0].id).map(a => a.due_date)).toEqual([
      '2026-03-06', '2026-03-20', '2026-03-27',
    ]);
  });
});

describe('applyToSeries', () => {
  it('renames the whole series, renumbering from the anchor', () => {
    const { series, assignments } = weeklySeries();

    applyToSeries({ assignmentId: assignments[2].id, scope: 'all', name: 'Problem Set 3' });

    expect(listBySeries(series.id).map(a => a.name)).toEqual([
      'Problem Set 1', 'Problem Set 2', 'Problem Set 3', 'Problem Set 4',
    ]);
  });

  it('renames only this one and later under "this_and_later"', () => {
    const { series, assignments } = weeklySeries();

    applyToSeries({
      assignmentId: assignments[2].id,
      scope: 'this_and_later',
      name: 'Problem Set 3',
    });

    expect(listBySeries(series.id).map(a => a.name)).toEqual([
      'Homework 1', 'Homework 2', 'Problem Set 3', 'Problem Set 4',
    ]);
  });

  it('renames a finished occurrence along with the rest', () => {
    // Deliberately unlike a date shift: a name is a label, not a record of when
    // something was due, so a handed-in row should follow the course's renaming.
    const { series, assignments } = weeklySeries();
    updateAssignment(assignments[1].id, { status: 'completed', score: 18, pointsPossible: 20 });

    applyToSeries({ assignmentId: assignments[0].id, scope: 'all', name: 'Problem Set 1' });

    expect(listBySeries(series.id)[1].name).toBe('Problem Set 2');
    // And the grade it carries is untouched by the rename.
    expect(getAssignment(assignments[1].id)!.score).toBe(18);
    expect(getAssignment(assignments[1].id)!.status).toBe('completed');
  });

  it('sets a due time across the series', () => {
    const { series, assignments } = weeklySeries();

    applyToSeries({ assignmentId: assignments[0].id, scope: 'all', dueTime: '23:59' });

    expect(listBySeries(series.id).every(a => a.due_time === '23:59')).toBe(true);
  });

  it('clears a due time back to all-day', () => {
    const { series, assignments } = weeklySeries();
    applyToSeries({ assignmentId: assignments[0].id, scope: 'all', dueTime: '23:59' });

    applyToSeries({ assignmentId: assignments[0].id, scope: 'all', dueTime: null });

    expect(listBySeries(series.id).every(a => a.due_time === null)).toBe(true);
  });

  it('leaves times alone when only a name is given', () => {
    const { series, assignments } = weeklySeries();
    applyToSeries({ assignmentId: assignments[0].id, scope: 'all', dueTime: '09:00' });

    applyToSeries({ assignmentId: assignments[0].id, scope: 'all', name: 'Problem Set 1' });

    expect(listBySeries(series.id).every(a => a.due_time === '09:00')).toBe(true);
  });

  it('never touches due dates', () => {
    const { series, assignments } = weeklySeries();
    const before = listBySeries(series.id).map(a => a.due_date);

    applyToSeries({ assignmentId: assignments[0].id, scope: 'all', name: 'Problem Set 1' });

    expect(listBySeries(series.id).map(a => a.due_date)).toEqual(before);
  });

  it('reports what changed, with the old values for Undo', () => {
    const { assignments } = weeklySeries();

    const result = applyToSeries({
      assignmentId: assignments[0].id,
      scope: 'all',
      name: 'Problem Set 1',
      dueTime: '23:59',
    });

    expect(result.changed).toHaveLength(4);
    expect(result.changed[0]).toEqual({
      id: assignments[0].id,
      fromName: 'Homework 1',
      toName: 'Problem Set 1',
      fromDueTime: null,
      toDueTime: '23:59',
    });
  });

  it('round-trips through setFields, which is how Undo works', () => {
    const { series, assignments } = weeklySeries();
    // One occurrence renamed by hand first, so a blanket re-rename would NOT
    // restore it.
    updateAssignment(assignments[2].id, { name: 'Homework 3 (take-home)' });
    const before = listBySeries(series.id).map(a => a.name);

    const result = applyToSeries({
      assignmentId: assignments[0].id,
      scope: 'all',
      name: 'Problem Set 1',
    });
    setFields(result.changed.map(c => ({ id: c.id, name: c.fromName, dueTime: c.fromDueTime })));

    expect(listBySeries(series.id).map(a => a.name)).toEqual(before);
  });

  it('skips rows it would not actually change', () => {
    const { assignments } = weeklySeries();

    // Same name, same (absent) time — nothing to write.
    const result = applyToSeries({
      assignmentId: assignments[0].id,
      scope: 'one',
      name: 'Homework 1',
    });

    expect(result.changed).toEqual([]);
  });

  it('renames a one-off assignment to exactly what was typed', () => {
    const solo = createAssignment({ courseId, name: 'Essay', dueDate: '2026-03-06' });

    applyToSeries({ assignmentId: solo.id, scope: 'all', name: 'Final essay' });

    expect(getAssignment(solo.id)!.name).toBe('Final essay');
  });

  it('throws for an assignment that does not exist', () => {
    expect(() => applyToSeries({ assignmentId: 'nope', scope: 'all', name: 'X' })).toThrow(
      /not found/i,
    );
  });
});

describe('linkIntoSeries', () => {
  /** Three weekly assignments the old way — unrelated rows, as everything was. */
  function looseRows() {
    return [
      createAssignment({ courseId, name: 'Homework 1', type: 'Homework', dueDate: '2026-03-06' }),
      createAssignment({ courseId, name: 'Homework 2', type: 'Homework', dueDate: '2026-03-13' }),
      createAssignment({ courseId, name: 'Homework 3', type: 'Homework', dueDate: '2026-03-20' }),
    ];
  }

  it('binds the rows into a series, in the order given', () => {
    const rows = looseRows();

    const { series, assignments } = linkIntoSeries({
      courseId,
      intervalWeeks: 1,
      assignmentIds: rows.map(r => r.id),
    });

    expect(assignments.map(a => a.id)).toEqual(rows.map(r => r.id));
    expect(assignments.map(a => a.series_index)).toEqual([1, 2, 3]);
    expect(assignments.every(a => a.series_id === series.id)).toBe(true);
  });

  it('reads the rule off the rows', () => {
    const rows = looseRows();

    const { series } = linkIntoSeries({
      courseId,
      intervalWeeks: 1,
      assignmentIds: rows.map(r => r.id),
    });

    expect(series.name_template).toBe('Homework 1');
    expect(series.type).toBe('Homework');
    expect(series.anchor_date).toBe('2026-03-06');
    expect(series.until_date).toBe('2026-03-20');
    expect(series.interval_weeks).toBe(1);
  });

  it('leaves names, dates and grades exactly as they were', () => {
    const rows = looseRows();
    updateAssignment(rows[1].id, { status: 'completed', score: 18, pointsPossible: 20 });
    const before = rows.map(r => getAssignment(r.id)!);

    linkIntoSeries({ courseId, intervalWeeks: 1, assignmentIds: rows.map(r => r.id) });

    for (const original of before) {
      const after = getAssignment(original.id)!;
      expect(after.name).toBe(original.name);
      expect(after.due_date).toBe(original.due_date);
      expect(after.score).toBe(original.score);
      expect(after.status).toBe(original.status);
      expect(after.created_at).toBe(original.created_at);
    }
  });

  it('produces a series that shifts like any other', () => {
    // The whole point: rows that predate the feature become movable as a group.
    const rows = looseRows();
    const { series } = linkIntoSeries({
      courseId,
      intervalWeeks: 1,
      assignmentIds: rows.map(r => r.id),
    });

    shiftAssignments({ assignmentId: rows[1].id, scope: 'this_and_later', days: 7 });

    expect(listBySeries(series.id).map(a => a.due_date)).toEqual([
      '2026-03-06', '2026-03-20', '2026-03-27',
    ]);
  });

  it('is undone cleanly by dropping the series', () => {
    const rows = looseRows();
    const { series } = linkIntoSeries({
      courseId,
      intervalWeeks: 1,
      assignmentIds: rows.map(r => r.id),
    });

    deleteAssignmentSeries(series.id);

    const after = rows.map(r => getAssignment(r.id)!);
    expect(after.every(a => a.series_id === null && a.series_index === null)).toBe(true);
    expect(after.map(a => a.name)).toEqual(['Homework 1', 'Homework 2', 'Homework 3']);
  });

  it('refuses a row that is already in a series', () => {
    const { assignments } = weeklySeries();
    const loose = createAssignment({ courseId, name: 'Essay', dueDate: '2026-03-06' });

    expect(() =>
      linkIntoSeries({ courseId, intervalWeeks: 1, assignmentIds: [loose.id, assignments[0].id] }),
    ).toThrow(/already part of a series/i);
  });

  it('refuses a row from another course', () => {
    const other = createCourse({ name: 'BIO 181', abbreviation: 'BIO', color: '#def' }).id;
    const mine = looseRows();
    const theirs = createAssignment({ courseId: other, name: 'Homework 4', dueDate: '2026-03-27' });

    expect(() =>
      linkIntoSeries({ courseId, intervalWeeks: 1, assignmentIds: [mine[0].id, theirs.id] }),
    ).toThrow(/different course/i);
  });

  it('refuses a row that no longer exists', () => {
    const rows = looseRows();

    expect(() =>
      linkIntoSeries({ courseId, intervalWeeks: 1, assignmentIds: [rows[0].id, 'gone'] }),
    ).toThrow(/no longer exists/i);
  });

  it('refuses fewer than two rows', () => {
    const rows = looseRows();

    expect(() =>
      linkIntoSeries({ courseId, intervalWeeks: 1, assignmentIds: [rows[0].id] }),
    ).toThrow(/at least two/i);
  });

  it('leaves everything untouched when it refuses', () => {
    const rows = looseRows();

    expect(() =>
      linkIntoSeries({ courseId, intervalWeeks: 1, assignmentIds: [rows[0].id, rows[1].id, 'gone'] }),
    ).toThrow();

    // The check runs before the transaction opens, so not even the first row
    // was stamped on the way to finding the bad one.
    expect(listAssignments({ courseId }).every(a => a.series_id === null)).toBe(true);
    expect(listAssignmentSeries({ courseId })).toEqual([]);
  });
});

describe('stopRepeatingFrom', () => {
  it('removes the anchor and every untouched occurrence after it', () => {
    const { series, assignments } = weeklySeries();

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.removed).toHaveLength(2);
    expect(result.kept).toEqual([]);
    expect(listBySeries(series.id).map(a => a.name)).toEqual(['Homework 1', 'Homework 2']);
  });

  it('pulls the series end date back to the last one left', () => {
    const { series, assignments } = weeklySeries();

    stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(getAssignmentSeries(series.id)!.until_date).toBe('2026-03-13');
  });

  it('keeps a completed occurrence and says so', () => {
    const { series, assignments } = weeklySeries();
    updateAssignment(assignments[3].id, { status: 'completed' });

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.removed.map(r => r.assignment.id)).toEqual([assignments[2].id]);
    expect(result.kept).toEqual([
      { id: assignments[3].id, name: 'Homework 4', reason: 'completed' },
    ]);
    expect(getAssignment(assignments[3].id)).not.toBeNull();
  });

  it('keeps a graded occurrence', () => {
    const { assignments } = weeklySeries();
    updateAssignment(assignments[3].id, { score: 18, pointsPossible: 20 });

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.kept[0].reason).toBe('graded');
  });

  it('keeps one that is merely in progress', () => {
    const { assignments } = weeklySeries();
    updateAssignment(assignments[3].id, { status: 'in_progress' });

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.kept[0].reason).toBe('in_progress');
  });

  it('keeps one with steps on it, however untouched it looks', () => {
    // Status says not_started, but someone sat down and broke it into steps.
    // That's work, and a scheduling decision doesn't get to throw it away.
    const { assignments } = weeklySeries();
    createSubtask({ assignmentId: assignments[3].id, name: 'Outline' });

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.kept).toEqual([
      { id: assignments[3].id, name: 'Homework 4', reason: 'has_work' },
    ]);
    expect(listSubtasks({ assignmentId: assignments[3].id })).toHaveLength(1);
  });

  it('keeps one with a planned study block', () => {
    const { assignments } = weeklySeries();
    createStudyBlocks([
      {
        assignmentId: assignments[3].id,
        courseId,
        title: 'Review',
        scheduledDate: '2026-03-18',
        durationMinutes: 45,
      },
    ]);

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.kept[0].reason).toBe('has_work');
  });

  it('keeps one with a linked note', () => {
    const { assignments } = weeklySeries();
    const note = createNote({ title: 'Working notes' });
    createNoteLink({ noteId: note.id, entityType: 'assignment', entityId: assignments[3].id });

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.kept[0].reason).toBe('has_work');
  });

  it('leaves everything before the cut alone', () => {
    const { assignments } = weeklySeries();

    stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(getAssignment(assignments[0].id)).not.toBeNull();
    expect(getAssignment(assignments[1].id)).not.toBeNull();
  });

  it('refuses to cut from the first occurrence', () => {
    const { assignments } = weeklySeries();

    expect(() => stopRepeatingFrom({ assignmentId: assignments[0].id })).toThrow(
      /stop repeating/i,
    );
  });

  it('refuses an assignment that is not in a series', () => {
    const solo = createAssignment({ courseId, name: 'Essay', dueDate: '2026-03-06' });

    expect(() => stopRepeatingFrom({ assignmentId: solo.id })).toThrow(/not part of a series/i);
  });

  it('removes nothing when the whole tail has work in it', () => {
    const { series, assignments } = weeklySeries();
    updateAssignment(assignments[2].id, { status: 'completed' });
    updateAssignment(assignments[3].id, { status: 'completed' });

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });

    expect(result.removed).toEqual([]);
    expect(result.kept).toHaveLength(2);
    // Nothing went, so the end date shouldn't move either.
    expect(getAssignmentSeries(series.id)!.until_date).toBe('2026-03-27');
  });

  it('is put back exactly by restoreOccurrences', () => {
    const { series, assignments } = weeklySeries();
    const before = listBySeries(series.id).map(a => ({ id: a.id, name: a.name, due: a.due_date, idx: a.series_index }));

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });
    restoreOccurrences({
      seriesId: result.seriesId,
      untilDate: result.previousUntilDate,
      snapshots: result.removed,
    });

    expect(
      listBySeries(series.id).map(a => ({ id: a.id, name: a.name, due: a.due_date, idx: a.series_index })),
    ).toEqual(before);
    expect(getAssignmentSeries(series.id)!.until_date).toBe('2026-03-27');
  });

  it('restores under the original ids, so the series is whole again', () => {
    const { series, assignments } = weeklySeries();

    const result = stopRepeatingFrom({ assignmentId: assignments[2].id });
    restoreOccurrences({
      seriesId: result.seriesId,
      untilDate: result.previousUntilDate,
      snapshots: result.removed,
    });

    // The point of restoring by id: a later "this and later" still reaches them.
    const shift = shiftAssignments({
      assignmentId: assignments[1].id,
      scope: 'this_and_later',
      days: 7,
    });
    expect(shift.changed).toHaveLength(3);
    expect(listBySeries(series.id)).toHaveLength(4);
  });
});
