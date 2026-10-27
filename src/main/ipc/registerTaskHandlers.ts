import { ipcMain } from 'electron';
import { IPC, ASSIGNMENT_STATUSES, SERIES_SCOPES } from '../../shared/types';
import type {
  ApplyToTaskSeriesInput,
  CreateTaskInput,
  DateSet,
  NameSet,
  RespaceTasksInput,
  ShiftTasksInput,
  UpdateTaskInput,
} from '../../shared/types';
import { assertIsoDate, assertOneOf, assertOptionalOneOf } from '../../shared/validate';
import {
  listTasks,
  createTask,
  createTasks,
  updateTask,
  deleteTask,
  shiftTasks,
  respaceSeries,
  setDates,
  applyToSeries,
  setNames,
} from '../db/repositories/taskRepo';

// Tasks share the assignment status enum (PRD §7). Same reasoning as the assignment
// handler: the column has no CHECK constraint, so this is the only gate.
function validateStatus(input: { status?: unknown }): void {
  assertOptionalOneOf(input.status, ASSIGNMENT_STATUSES, 'status');
}

export function registerTaskHandlers(): void {
  ipcMain.handle(IPC.TASKS.LIST, () => listTasks());

  ipcMain.handle(IPC.TASKS.CREATE, (_event, input: CreateTaskInput) => {
    if (!input.name?.trim()) throw new Error('Task name is required');
    if (!input.dueDate)      throw new Error('dueDate is required');
    validateStatus(input);
    return createTask(input);
  });

  ipcMain.handle(IPC.TASKS.CREATE_MANY, (_event, inputs: CreateTaskInput[]) => {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('inputs must be a non-empty array');
    if (inputs.length > 500) throw new Error('Too many tasks in one batch (max 500)');
    for (const input of inputs) {
      if (!input.name?.trim()) throw new Error('Task name is required on every row');
      if (!input.dueDate)      throw new Error('dueDate is required on every row');
      validateStatus(input);
    }
    return createTasks(inputs);
  });

  ipcMain.handle(IPC.TASKS.UPDATE, (_event, id: string, input: UpdateTaskInput) => {
    if (!id) throw new Error('Task id is required');
    validateStatus(input);
    return updateTask(id, input);
  });

  ipcMain.handle(IPC.TASKS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Task id is required');
    deleteTask(id);
  });

  // Mirrors assignments:shift, including the bound — a year either way is more
  // than any real reschedule and keeps a runaway caller from walking a task into
  // the next century.
  ipcMain.handle(IPC.TASKS.SHIFT, (_event, input: ShiftTasksInput) => {
    if (!input?.taskId) throw new Error('taskId is required');
    assertOneOf(input.scope, SERIES_SCOPES, 'scope');
    if (!Number.isInteger(input.days)) throw new Error('days must be a whole number');
    if (input.days === 0) throw new Error('days must not be zero');
    if (Math.abs(input.days) > 365) throw new Error('days must be within a year either way');
    return shiftTasks(input);
  });

  // Put a run back on a rhythm. Mirrors assignments:respace.
  ipcMain.handle(IPC.TASKS.RESPACE, (_event, input: RespaceTasksInput) => {
    if (!input?.taskId) throw new Error('taskId is required');
    if (!Number.isInteger(input.intervalWeeks) || input.intervalWeeks < 1) {
      throw new Error('intervalWeeks must be a whole number of weeks, at least 1');
    }
    if (input.intervalWeeks > 52) throw new Error('intervalWeeks must be at most 52');
    return respaceSeries(input);
  });

  // The bulk date write behind a shift and its Undo. The whole batch is validated
  // before any of it lands, matching the repo's all-or-nothing write.
  ipcMain.handle(IPC.TASKS.SET_DATES, (_event, items: DateSet[]) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array');
    if (items.length > 500) throw new Error('Too many tasks in one batch (max 500)');
    for (const item of items) {
      if (!item?.id) throw new Error('id is required on every row');
      assertIsoDate(item.dueDate, 'dueDate');
    }
    return setDates(items);
  });

  // A rename applied across a scope. Mirrors assignments:apply-series, minus the
  // time of day a task doesn't have.
  ipcMain.handle(IPC.TASKS.APPLY_SERIES, (_event, input: ApplyToTaskSeriesInput) => {
    if (!input?.taskId) throw new Error('taskId is required');
    assertOneOf(input.scope, SERIES_SCOPES, 'scope');
    if (!input.name?.trim()) throw new Error('Task name is required');
    return applyToSeries(input);
  });

  // The bulk name write behind the above and its Undo.
  ipcMain.handle(IPC.TASKS.SET_NAMES, (_event, items: NameSet[]) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array');
    if (items.length > 500) throw new Error('Too many tasks in one batch (max 500)');
    for (const item of items) {
      if (!item?.id) throw new Error('id is required on every row');
      if (!item.name?.trim()) throw new Error('Task name is required on every row');
    }
    return setNames(items);
  });
}
