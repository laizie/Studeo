import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateMeetingExceptionInput } from '../../shared/types';
import {
  listMeetingExceptions,
  createMeetingException,
  deleteMeetingException,
} from '../db/repositories/meetingExceptionRepo';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function registerMeetingExceptionHandlers(): void {
  ipcMain.handle(IPC.MEETING_EXCEPTIONS.LIST, (_event, filters?: { meetingId?: string }) =>
    listMeetingExceptions(filters)
  );

  ipcMain.handle(IPC.MEETING_EXCEPTIONS.CREATE, (_event, input: CreateMeetingExceptionInput) => {
    if (!input.meetingId)             throw new Error('meetingId is required');
    if (!DATE_RE.test(input.date ?? '')) throw new Error('date must be YYYY-MM-DD');
    if (input.kind !== 'cancelled' && input.kind !== 'moved') {
      throw new Error('kind must be "cancelled" or "moved"');
    }
    if (input.kind === 'moved') {
      if (!TIME_RE.test(input.newStartTime ?? '')) throw new Error('newStartTime must be "HH:MM"');
      if (!TIME_RE.test(input.newEndTime ?? ''))   throw new Error('newEndTime must be "HH:MM"');
    }
    return createMeetingException(input);
  });

  ipcMain.handle(IPC.MEETING_EXCEPTIONS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('id is required');
    deleteMeetingException(id);
  });
}
