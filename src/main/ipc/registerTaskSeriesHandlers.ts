import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type {
  CreateTaskSeriesInput,
  ExtendTaskSeriesInput,
  RestoreTaskOccurrencesInput,
  StopRepeatingTasksInput,
} from '../../shared/types';
import { assertIsoDate } from '../../shared/validate';
import {
  listTaskSeries,
  getTaskSeries,
  createTaskSeries,
  stopRepeatingFrom,
  restoreOccurrences,
  extendTaskSeries,
  deleteTaskSeries,
} from '../db/repositories/taskSeriesRepo';

// The dialog offers weekly and biweekly; main doesn't get to assume that. An
// interval of 0 would leave generateRepeats' cursor standing still, and a
// fractional one silently produces nothing.
function validateInterval(value: unknown): void {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error('intervalWeeks must be a whole number of weeks, at least 1');
  }
  if ((value as number) > 52) {
    throw new Error('intervalWeeks must be at most 52');
  }
}

export function registerTaskSeriesHandlers(): void {
  ipcMain.handle(IPC.TASK_SERIES.LIST, () => listTaskSeries());

  ipcMain.handle(IPC.TASK_SERIES.CREATE, (_event, input: CreateTaskSeriesInput) => {
    if (!input?.name?.trim()) throw new Error('Task name is required');
    assertIsoDate(input.anchorDate, 'anchorDate');
    assertIsoDate(input.untilDate, 'untilDate');
    // A series whose end is on or before its start has exactly one occurrence,
    // which is a plain task wearing a rule.
    if (input.untilDate <= input.anchorDate) {
      throw new Error('untilDate must be after anchorDate');
    }
    validateInterval(input.intervalWeeks);
    return createTaskSeries(input);
  });

  // "The rest of these aren't happening." Removes the untouched tail and pulls
  // the end date back; anything started or done is kept and named.
  ipcMain.handle(IPC.TASK_SERIES.STOP_FROM, (_event, input: StopRepeatingTasksInput) => {
    if (!input?.taskId) throw new Error('taskId is required');
    return stopRepeatingFrom(input);
  });

  ipcMain.handle(IPC.TASK_SERIES.RESTORE_OCCURRENCES, (_event, input: RestoreTaskOccurrencesInput) => {
    if (!input?.seriesId) throw new Error('seriesId is required');
    assertIsoDate(input.untilDate, 'untilDate');
    if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
      throw new Error('Nothing to restore');
    }
    for (const task of input.tasks) {
      if (!task?.id || !task.name) throw new Error('Nothing to restore');
    }
    restoreOccurrences(input);
  });

  ipcMain.handle(IPC.TASK_SERIES.EXTEND, (_event, input: ExtendTaskSeriesInput) => {
    if (!input?.seriesId) throw new Error('seriesId is required');
    assertIsoDate(input.untilDate, 'untilDate');

    // Read the series here rather than letting the repo shrug: pulling the end
    // date backwards generates nothing, and "nothing happened" is a worse answer
    // than saying the date is before the series already ends.
    const series = getTaskSeries(input.seriesId);
    if (!series) throw new Error('Series not found');
    if (input.untilDate <= series.until_date) {
      throw new Error('untilDate must be later than the series already runs');
    }

    return extendTaskSeries(input);
  });

  // Drops the rule only — every occurrence stays as a standalone task.
  ipcMain.handle(IPC.TASK_SERIES.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Series id is required');
    deleteTaskSeries(id);
  });
}
