import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateTaskInput, UpdateTaskInput } from '../../shared/types';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
} from '../db/repositories/taskRepo';

export function registerTaskHandlers(): void {
  ipcMain.handle(IPC.TASKS.LIST, () => listTasks());

  ipcMain.handle(IPC.TASKS.CREATE, (_event, input: CreateTaskInput) => {
    if (!input.name?.trim()) throw new Error('Task name is required');
    if (!input.dueDate)      throw new Error('dueDate is required');
    return createTask(input);
  });

  ipcMain.handle(IPC.TASKS.UPDATE, (_event, id: string, input: UpdateTaskInput) => {
    if (!id) throw new Error('Task id is required');
    return updateTask(id, input);
  });

  ipcMain.handle(IPC.TASKS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Task id is required');
    deleteTask(id);
  });
}
