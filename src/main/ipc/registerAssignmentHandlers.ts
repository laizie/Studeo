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
  createAssignments,
  updateAssignment,
  deleteAssignment,
} from '../db/repositories/assignmentRepo';

// score/pointsPossible: absent or null = "no grade recorded"; otherwise both
// must be sane non-negative numbers and you can't earn points out of nothing.
function validateGradeFields(input: { score?: number | null; pointsPossible?: number | null }): void {
  if (input.score != null && (!Number.isFinite(input.score) || input.score < 0)) {
    throw new Error('score must be a non-negative number');
  }
  if (input.pointsPossible != null && (!Number.isFinite(input.pointsPossible) || input.pointsPossible <= 0)) {
    throw new Error('pointsPossible must be a positive number');
  }
}

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
    validateGradeFields(input);
    return createAssignment(input);
  });

  ipcMain.handle(IPC.ASSIGNMENTS.CREATE_MANY, (_event, inputs: CreateAssignmentInput[]) => {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('inputs must be a non-empty array');
    if (inputs.length > 500) throw new Error('Too many assignments in one batch (max 500)');
    for (const input of inputs) {
      if (!input.courseId)     throw new Error('courseId is required on every row');
      if (!input.name?.trim()) throw new Error('Assignment name is required on every row');
      if (!input.dueDate)      throw new Error('dueDate is required on every row');
    }
    return createAssignments(inputs);
  });

  ipcMain.handle(IPC.ASSIGNMENTS.UPDATE, (_event, id: string, input: UpdateAssignmentInput) => {
    if (!id) throw new Error('Assignment id is required');
    validateGradeFields(input);
    return updateAssignment(id, input);
  });

  ipcMain.handle(IPC.ASSIGNMENTS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Assignment id is required');
    deleteAssignment(id);
  });
}
