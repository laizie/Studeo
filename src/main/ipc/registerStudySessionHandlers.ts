import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateStudySessionInput } from '../../shared/types';
import { listStudySessions, createStudySession } from '../db/repositories/studySessionRepo';

const VALID_KINDS = ['focus', 'short_break', 'long_break'];

export function registerStudySessionHandlers(): void {
  ipcMain.handle(IPC.STUDY_SESSIONS.LIST, () => listStudySessions());

  ipcMain.handle(IPC.STUDY_SESSIONS.CREATE, (_event, input: CreateStudySessionInput) => {
    if (!input.startedAt) throw new Error('startedAt is required');
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
      throw new Error('durationSeconds must be a positive number');
    }
    if (!VALID_KINDS.includes(input.kind)) throw new Error('kind must be a valid session kind');
    return createStudySession(input);
  });
}
