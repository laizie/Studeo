import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateSubtaskInput, UpdateSubtaskInput } from '../../shared/types';
import {
  listSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
} from '../db/repositories/subtaskRepo';

export function registerSubtaskHandlers(): void {
  ipcMain.handle(IPC.SUBTASKS.LIST, (_event, filters?: { assignmentId?: string }) =>
    listSubtasks(filters)
  );

  ipcMain.handle(IPC.SUBTASKS.CREATE, (_event, input: CreateSubtaskInput) => {
    if (!input.assignmentId)   throw new Error('assignmentId is required');
    if (!input.name?.trim())   throw new Error('name is required');
    return createSubtask({ ...input, name: input.name.trim() });
  });

  ipcMain.handle(IPC.SUBTASKS.UPDATE, (_event, id: string, input: UpdateSubtaskInput) => {
    if (!id) throw new Error('id is required');
    if (input.name !== undefined && !input.name.trim()) throw new Error('name cannot be empty');
    return updateSubtask(id, input);
  });

  ipcMain.handle(IPC.SUBTASKS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('id is required');
    deleteSubtask(id);
  });
}
