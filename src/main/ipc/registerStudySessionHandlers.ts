import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateStudySessionInput, UpdateStudySessionInput } from '../../shared/types';
import {
  listStudySessions,
  createStudySession,
  updateStudySession,
} from '../db/repositories/studySessionRepo';

const VALID_KINDS = ['focus', 'short_break', 'long_break'];

// reflection/intention are free text or explicitly cleared (null) — anything else is a bug.
function validText(value: unknown, label: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${label} must be a string or null`);
  }
}

export function registerStudySessionHandlers(): void {
  ipcMain.handle(IPC.STUDY_SESSIONS.LIST, () => listStudySessions());

  ipcMain.handle(IPC.STUDY_SESSIONS.CREATE, (_event, input: CreateStudySessionInput) => {
    if (!input.startedAt) throw new Error('startedAt is required');
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
      throw new Error('durationSeconds must be a positive number');
    }
    if (!VALID_KINDS.includes(input.kind)) throw new Error('kind must be a valid session kind');
    validText(input.intention, 'intention');
    return createStudySession(input);
  });

  ipcMain.handle(IPC.STUDY_SESSIONS.UPDATE, (_event, id: string, input: UpdateStudySessionInput) => {
    if (typeof id !== 'string' || !id) throw new Error('id is required');
    validText(input.reflection, 'reflection');
    validText(input.intention, 'intention');
    return updateStudySession(id, input);
  });
}
