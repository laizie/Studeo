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
  shiftTasks,
} from '../repositories/taskRepo';
import {
  listTaskSeries,
  getTaskSeries,
  createTaskSeries,
  extendTaskSeries,
  deleteTaskSeries,
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
