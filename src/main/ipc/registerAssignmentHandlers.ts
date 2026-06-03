import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type {
  AssignmentStatus,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from '../../shared/types';
import {
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '../db/repositories/assignmentRepo';

export function registerAssignmentHandlers(): void {
  ipcMain.handle(
    IPC.ASSIGNMENTS.LIST,
    (_event, filters?: { courseId?: string; status?: AssignmentStatus }) =>
      listAssignments(filters ?? {})
  );

  ipcMain.handle(IPC.ASSIGNMENTS.CREATE, (_event, input: CreateAssignmentInput) => {
    if (!input.courseId)      throw new Error('courseId is required');
    if (!input.name?.trim())  throw new Error('Assignment name is required');
    if (!input.dueDate)       throw new Error('dueDate is required');
    return createAssignment(input);
  });

  ipcMain.handle(IPC.ASSIGNMENTS.UPDATE, (_event, id: string, input: UpdateAssignmentInput) => {
    if (!id) throw new Error('Assignment id is required');
    return updateAssignment(id, input);
  });

  ipcMain.handle(IPC.ASSIGNMENTS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Assignment id is required');
    deleteAssignment(id);
  });
}
