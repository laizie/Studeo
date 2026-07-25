import { ipcMain } from 'electron';
import { IPC, ASSIGNMENT_STATUSES } from '../../shared/types';
import type { CreateTaskInput, UpdateTaskInput } from '../../shared/types';
import { assertOptionalOneOf } from '../../shared/validate';
import {
  listTasks,
  createTask,
  createTasks,
  updateTask,
  deleteTask,
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
}
