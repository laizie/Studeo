import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import {
  getTask,
  listTasks,
  createTask,
  updateTask,
  listBySeries,
  setDates,
  setNames,
  shiftTasks,
  applyToSeries,
} from '../repositories/taskRepo';
import {
  listTaskSeries,
  getTaskSeries,
  createTaskSeries,
  extendTaskSeries,
  deleteTaskSeries,
  stopRepeatingFrom,
  restoreOccurrences,
} from '../repositories/taskSeriesRepo';

beforeEach(() => {
  mockDb.current = createTestDb();
});

/** A weekly series of four: Mar 6, 13, 20, 27. */
function weeklySeries() {
  return createTaskSeries({
    name: 'Water the plants 1',
    anchorDate: '2026-03-06',
    untilDate: '2026-03-27',
    intervalWeeks: 1,
  });
}

describe('createTaskSeries', () => {
  it('creates the rule and its occurrences together', () => {
    const { series, tasks } = weeklySeries();

    expect(series.name_template).toBe('Water the plants 1');
    expect(series.interval_weeks).toBe(1);
    expect(tasks.map(t => t.due_date)).toEqual([
      '2026-03-06', '2026-03-13', '2026-03-20', '2026-03-27',
    ]);
  });

  it('numbers the occurrences and indexes them from 1', () => {
    const { series, tasks } = weeklySeries();

    expect(tasks.map(t => t.name)).toEqual([
      'Water the plants 1', 'Water the plants 2', 'Water the plants 3', 'Water the plants 4',
    ]);
    expect(tasks.map(t => t.series_index)).toEqual([1, 2, 3, 4]);
    expect(tasks.every(t => t.series_id === series.id)).toBe(true);
  });

  it('lists the series it created', () => {
    weeklySeries();
    expect(listTaskSeries()).toHaveLength(1);
  });

  it('supports a biweekly interval', () => {
    const { tasks } = createTaskSeries({
      name: 'Deep clean 1',
      anchorDate: '2026-03-06',
      untilDate: '2026-04-03',
      intervalWeeks: 2,
    });

    expect(tasks.map(t => t.due_date)).toEqual(['2026-03-06', '2026-03-20', '2026-04-03']);
  });
});

describe('shiftTasks', () => {
  it('moves only the anchor under scope "one"', () => {
    const { series, tasks } = weeklySeries();

    const result = shiftTasks({ taskId: tasks[1].id, scope: 'one', days: 7 });

    expect(result.changed).toEqual([
      { id: tasks[1].id, from: '2026-03-13', to: '2026-03-20' },
    ]);
    expect(listBySeries(series.id).map(t => t.due_date)).toEqual([
      '2026-03-06', '2026-03-20', '2026-03-20', '2026-03-27',
    ]);
  });

  it('moves the anchor and everything after it under "this_and_later"', () => {
    const { series, tasks } = weeklySeries();

    const result = shiftTasks({ taskId: tasks[1].id, scope: 'this_and_later', days: 7 });

    expect(result.changed).toHaveLength(3);
    expect(listBySeries(series.id).map(t => t.due_date)).toEqual([
      '2026-03-06', '2026-03-20', '2026-03-27', '2026-04-03',
    ]);
  });

  it('moves every occurrence under "all"', () => {
    const { series, tasks } = weeklySeries();

    shiftTasks({ taskId: tasks[2].id, scope: 'all', days: -1 });

    expect(listBySeries(series.id).map(t => t.due_date)).toEqual([
      '2026-03-05', '2026-03-12', '2026-03-19', '2026-03-26',
    ]);
  });

  it('counts "later" by series position, not by date', () => {
    const { tasks } = weeklySeries();
    // Occurrence 2 dragged past occurrence 4 by hand. By date it is now last; by
    // series position it is still second, and that is what the scope must use.
    updateTask(tasks[1].id, { dueDate: '2026-04-10' });

    const result = shiftTasks({ taskId: tasks[1].id, scope: 'this_and_later', days: 7 });

    expect(result.changed.map(c => c.id)).toEqual([tasks[1].id, tasks[2].id, tasks[3].id]);
  });

  it('leaves completed occurrences where they are', () => {
    const { tasks } = weeklySeries();
    updateTask(tasks[1].id, { status: 'completed' });

    const result = shiftTasks({ taskId: tasks[0].id, scope: 'all', days: 7 });

    expect(result.changed.map(c => c.id)).toEqual([tasks[0].id, tasks[2].id, tasks[3].id]);
    expect(result.skipped).toEqual([
      { id: tasks[1].id, name: 'Water the plants 2', reason: 'completed' },
    ]);
    expect(getTask(tasks[1].id)!.due_date).toBe('2026-03-13');
  });

  it('still moves the anchor when the anchor itself is done', () => {
    const { tasks } = weeklySeries();
    updateTask(tasks[0].id, { status: 'completed' });

    const result = shiftTasks({ taskId: tasks[0].id, scope: 'one', days: 7 });

    expect(result.changed).toHaveLength(1);
    expect(getTask(tasks[0].id)!.due_date).toBe('2026-03-13');
  });

  it('treats a one-off task as only itself, whatever the scope', () => {
    const solo = createTask({ name: 'Email the TA', dueDate: '2026-03-06' });

    const result = shiftTasks({ taskId: solo.id, scope: 'all', days: 7 });

    expect(result.changed).toEqual([{ id: solo.id, from: '2026-03-06', to: '2026-03-13' }]);
  });

  it('throws for a task that does not exist', () => {
    expect(() => shiftTasks({ taskId: 'nope', scope: 'one', days: 7 })).toThrow(/not found/i);
  });

  it('round-trips through setDates, which is how Undo works', () => {
    const { series, tasks } = weeklySeries();
    // Move one occurrence by hand first, so a blanket -7 would NOT restore it.
    updateTask(tasks[2].id, { dueDate: '2026-03-18' });
    const before = listBySeries(series.id).map(t => t.due_date);

    const result = shiftTasks({ taskId: tasks[0].id, scope: 'all', days: 7 });
    setDates(result.changed.map(c => ({ id: c.id, dueDate: c.from })));

    expect(listBySeries(series.id).map(t => t.due_date)).toEqual(before);
  });

  it('leaves a completed task its completed_at when its date moves', () => {
    const { tasks } = weeklySeries();
    const done = updateTask(tasks[0].id, { status: 'completed' });

    // The anchor moves even when done; the bulk date write must not disturb the
    // completion bookkeeping on its way through.
    shiftTasks({ taskId: tasks[0].id, scope: 'one', days: 7 });

    expect(getTask(tasks[0].id)!.completed_at).toBe(done.completed_at);
    expect(getTask(tasks[0].id)!.status).toBe('completed');
  });
});

describe('extendTaskSeries', () => {
  it('appends the occurrences that fit the later end date', () => {
    const { series, tasks } = weeklySeries();

    const { tasks: added } = extendTaskSeries({ seriesId: series.id, untilDate: '2026-04-10' });

    expect(added.map(t => t.due_date)).toEqual(['2026-04-03', '2026-04-10']);
    expect(added.map(t => t.series_index)).toEqual([5, 6]);
    expect(listBySeries(series.id)).toHaveLength(tasks.length + 2);
  });

  it('records the new end date on the rule', () => {
    const { series } = weeklySeries();

    extendTaskSeries({ seriesId: series.id, untilDate: '2026-04-10' });

    expect(getTaskSeries(series.id)!.until_date).toBe('2026-04-10');
  });

  it('continues from the last occurrence, not from the anchor', () => {
    const { series, tasks } = weeklySeries();
    updateTask(tasks[3].id, { dueDate: '2026-04-03' });

    const { tasks: added } = extendTaskSeries({ seriesId: series.id, untilDate: '2026-04-17' });

    expect(added.map(t => t.due_date)).toEqual(['2026-04-10', '2026-04-17']);
  });

  it('throws for a series that does not exist', () => {
    expect(() => extendTaskSeries({ seriesId: 'nope', untilDate: '2026-04-10' })).toThrow(
      /not found/i,
    );
  });
});

describe('deleteTaskSeries', () => {
  it('drops the rule and keeps every occurrence', () => {
    const { series, tasks } = weeklySeries();

    deleteTaskSeries(series.id);

    expect(getTaskSeries(series.id)).toBeNull();
    expect(listTasks()).toHaveLength(tasks.length);
  });

  it('clears both series columns, leaving no orphaned position', () => {
    const { series, tasks } = weeklySeries();

    deleteTaskSeries(series.id);

    const rows = listTasks();
    expect(rows.every(t => t.series_id === null)).toBe(true);
    expect(rows.every(t => t.series_index === null)).toBe(true);
    expect(rows.map(t => t.id).sort()).toEqual(tasks.map(t => t.id).sort());
  });

  it('keeps status and completion on the surviving occurrences', () => {
    const { series, tasks } = weeklySeries();
    updateTask(tasks[0].id, { status: 'completed' });

    deleteTaskSeries(series.id);

    const survivor = getTask(tasks[0].id)!;
    expect(survivor.status).toBe('completed');
    expect(survivor.completed_at).not.toBeNull();
  });
});

describe('applyToSeries', () => {
  it('renames the whole series, renumbering from the anchor', () => {
    const { series, tasks } = weeklySeries();

    applyToSeries({ taskId: tasks[2].id, scope: 'all', name: 'Feed the cat 3' });

    expect(listBySeries(series.id).map(t => t.name)).toEqual([
      'Feed the cat 1', 'Feed the cat 2', 'Feed the cat 3', 'Feed the cat 4',
    ]);
  });

  it('renames only this one and later under "this_and_later"', () => {
    const { series, tasks } = weeklySeries();

    applyToSeries({ taskId: tasks[2].id, scope: 'this_and_later', name: 'Feed the cat 3' });

    expect(listBySeries(series.id).map(t => t.name)).toEqual([
      'Water the plants 1', 'Water the plants 2', 'Feed the cat 3', 'Feed the cat 4',
    ]);
  });

  it('renames a finished occurrence along with the rest', () => {
    const { series, tasks } = weeklySeries();
    updateTask(tasks[1].id, { status: 'completed' });

    applyToSeries({ taskId: tasks[0].id, scope: 'all', name: 'Feed the cat 1' });

    expect(listBySeries(series.id)[1].name).toBe('Feed the cat 2');
    expect(getTask(tasks[1].id)!.status).toBe('completed');
  });

  it('never touches due dates', () => {
    const { series, tasks } = weeklySeries();
    const before = listBySeries(series.id).map(t => t.due_date);

    applyToSeries({ taskId: tasks[0].id, scope: 'all', name: 'Feed the cat 1' });

    expect(listBySeries(series.id).map(t => t.due_date)).toEqual(before);
  });

  it('round-trips through setNames, which is how Undo works', () => {
    const { series, tasks } = weeklySeries();
    updateTask(tasks[2].id, { name: 'Water the plants 3 (holiday)' });
    const before = listBySeries(series.id).map(t => t.name);

    const result = applyToSeries({ taskId: tasks[0].id, scope: 'all', name: 'Feed the cat 1' });
    setNames(result.changed.map(c => ({ id: c.id, name: c.from })));

    expect(listBySeries(series.id).map(t => t.name)).toEqual(before);
  });

  it('renames a one-off task to exactly what was typed', () => {
    const solo = createTask({ name: 'Email the TA', dueDate: '2026-03-06' });

    applyToSeries({ taskId: solo.id, scope: 'all', name: 'Email the professor' });

    expect(getTask(solo.id)!.name).toBe('Email the professor');
  });

  it('throws for a task that does not exist', () => {
    expect(() => applyToSeries({ taskId: 'nope', scope: 'all', name: 'X' })).toThrow(/not found/i);
  });
});

describe('stopRepeatingFrom', () => {
  it('removes the anchor and every untouched occurrence after it', () => {
    const { series, tasks } = weeklySeries();

    const result = stopRepeatingFrom({ taskId: tasks[2].id });

    expect(result.removed.map(t => t.id)).toEqual([tasks[2].id, tasks[3].id]);
    expect(result.kept).toEqual([]);
    expect(listBySeries(series.id).map(t => t.name)).toEqual([
      'Water the plants 1', 'Water the plants 2',
    ]);
  });

  it('pulls the series end date back to the last one left', () => {
    const { series, tasks } = weeklySeries();

    stopRepeatingFrom({ taskId: tasks[2].id });

    expect(getTaskSeries(series.id)!.until_date).toBe('2026-03-13');
  });

  it('keeps a completed occurrence and says so', () => {
    const { tasks } = weeklySeries();
    updateTask(tasks[3].id, { status: 'completed' });

    const result = stopRepeatingFrom({ taskId: tasks[2].id });

    expect(result.removed.map(t => t.id)).toEqual([tasks[2].id]);
    expect(result.kept).toEqual([
      { id: tasks[3].id, name: 'Water the plants 4', reason: 'completed' },
    ]);
    expect(getTask(tasks[3].id)).not.toBeNull();
  });

  it('keeps one that is merely in progress', () => {
    const { tasks } = weeklySeries();
    updateTask(tasks[3].id, { status: 'in_progress' });

    const result = stopRepeatingFrom({ taskId: tasks[2].id });

    expect(result.kept[0].reason).toBe('in_progress');
  });

  it('leaves the end date where it is when something later survives', () => {
    const { series, tasks } = weeklySeries();
    updateTask(tasks[3].id, { status: 'completed' });

    stopRepeatingFrom({ taskId: tasks[2].id });

    // The last occurrence was kept, so the series still runs to its date.
    expect(getTaskSeries(series.id)!.until_date).toBe('2026-03-27');
  });

  it('leaves everything before the cut alone', () => {
    const { tasks } = weeklySeries();

    stopRepeatingFrom({ taskId: tasks[2].id });

    expect(getTask(tasks[0].id)).not.toBeNull();
    expect(getTask(tasks[1].id)).not.toBeNull();
  });

  it('refuses to cut from the first occurrence', () => {
    const { tasks } = weeklySeries();

    expect(() => stopRepeatingFrom({ taskId: tasks[0].id })).toThrow(/stop repeating/i);
  });

  it('refuses a task that is not in a series', () => {
    const solo = createTask({ name: 'Email the TA', dueDate: '2026-03-06' });

    expect(() => stopRepeatingFrom({ taskId: solo.id })).toThrow(/not part of a series/i);
  });

  it('removes nothing when the whole tail has been started', () => {
    const { series, tasks } = weeklySeries();
    updateTask(tasks[2].id, { status: 'in_progress' });
    updateTask(tasks[3].id, { status: 'completed' });

    const result = stopRepeatingFrom({ taskId: tasks[2].id });

    expect(result.removed).toEqual([]);
    expect(result.kept).toHaveLength(2);
    expect(getTaskSeries(series.id)!.until_date).toBe('2026-03-27');
  });

  it('is put back exactly by restoreOccurrences', () => {
    const { series, tasks } = weeklySeries();
    const before = listBySeries(series.id).map(t => ({
      id: t.id, name: t.name, due: t.due_date, idx: t.series_index,
    }));

    const result = stopRepeatingFrom({ taskId: tasks[2].id });
    restoreOccurrences({
      seriesId: result.seriesId,
      untilDate: result.previousUntilDate,
      tasks: result.removed,
    });

    expect(
      listBySeries(series.id).map(t => ({
        id: t.id, name: t.name, due: t.due_date, idx: t.series_index,
      })),
    ).toEqual(before);
    expect(getTaskSeries(series.id)!.until_date).toBe('2026-03-27');
  });

  it('brings a completed occurrence back still completed', () => {
    const { tasks } = weeklySeries();
    const done = updateTask(tasks[3].id, { status: 'completed' });
    // Re-open it so it's droppable, then cut and restore.
    updateTask(tasks[3].id, { status: 'not_started' });

    const result = stopRepeatingFrom({ taskId: tasks[2].id });
    restoreOccurrences({
      seriesId: result.seriesId,
      untilDate: result.previousUntilDate,
      tasks: result.removed,
    });

    const back = getTask(tasks[3].id)!;
    expect(back.status).toBe('not_started');
    expect(back.created_at).toBe(done.created_at);
  });

  it('restores under the original ids, so the series is whole again', () => {
    const { series, tasks } = weeklySeries();

    const result = stopRepeatingFrom({ taskId: tasks[2].id });
    restoreOccurrences({
      seriesId: result.seriesId,
      untilDate: result.previousUntilDate,
      tasks: result.removed,
    });

    // The point of restoring by id: a later "this and later" still reaches them.
    const shift = shiftTasks({ taskId: tasks[1].id, scope: 'this_and_later', days: 7 });
    expect(shift.changed).toHaveLength(3);
    expect(listBySeries(series.id)).toHaveLength(4);
  });
});
