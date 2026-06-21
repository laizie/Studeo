import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateStudyBlockInput, UpdateStudyBlockInput } from '../../shared/types';
import {
  listStudyBlocks,
  createStudyBlocks,
  updateStudyBlock,
  deleteStudyBlock,
  deleteStudyBlocksForAssignment,
} from '../db/repositories/studyBlockRepo';

const VALID_STATUS = ['planned', 'done', 'skipped'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateCreate(input: CreateStudyBlockInput): void {
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('title is required');
  if (!DATE_RE.test(input.scheduledDate)) throw new Error('scheduledDate must be YYYY-MM-DD');
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error('durationMinutes must be a positive number');
  }
}

export function registerStudyBlockHandlers(): void {
  ipcMain.handle(IPC.STUDY_BLOCKS.LIST, () => listStudyBlocks());

  ipcMain.handle(IPC.STUDY_BLOCKS.CREATE_MANY, (_event, inputs: CreateStudyBlockInput[]) => {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('inputs must be a non-empty array');
    inputs.forEach(validateCreate);
    return createStudyBlocks(inputs);
  });

  ipcMain.handle(IPC.STUDY_BLOCKS.UPDATE, (_event, id: string, input: UpdateStudyBlockInput) => {
    if (typeof id !== 'string' || !id) throw new Error('id is required');
    if (input.status !== undefined && !VALID_STATUS.includes(input.status)) {
      throw new Error('status must be a valid study-block status');
    }
    if (input.scheduledDate !== undefined && !DATE_RE.test(input.scheduledDate)) {
      throw new Error('scheduledDate must be YYYY-MM-DD');
    }
    return updateStudyBlock(id, input);
  });

  ipcMain.handle(IPC.STUDY_BLOCKS.DELETE, (_event, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('id is required');
    deleteStudyBlock(id);
  });

  ipcMain.handle(IPC.STUDY_BLOCKS.DELETE_FOR_ASSIGNMENT, (_event, assignmentId: string) => {
    if (typeof assignmentId !== 'string' || !assignmentId) throw new Error('assignmentId is required');
    deleteStudyBlocksForAssignment(assignmentId);
  });
}
