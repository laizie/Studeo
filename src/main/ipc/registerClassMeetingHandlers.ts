import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateClassMeetingInput, UpdateClassMeetingInput } from '../../shared/types';
import {
  listClassMeetings,
  createClassMeeting,
  updateClassMeeting,
  deleteClassMeeting,
} from '../db/repositories/classMeetingRepo';
import { deleteLinksForEntity } from '../db/repositories/noteLinkRepo';

export function registerClassMeetingHandlers(): void {
  ipcMain.handle(IPC.CLASS_MEETINGS.LIST, (_event, filters?: { courseId?: string }) =>
    listClassMeetings(filters)
  );

  ipcMain.handle(IPC.CLASS_MEETINGS.CREATE, (_event, input: CreateClassMeetingInput) => {
    if (!input.courseId)               throw new Error('courseId is required');
    if (input.dayOfWeek == null)       throw new Error('dayOfWeek is required');
    if (!input.startTime?.trim())      throw new Error('startTime is required');
    if (!input.endTime?.trim())        throw new Error('endTime is required');
    return createClassMeeting(input);
  });

  ipcMain.handle(IPC.CLASS_MEETINGS.UPDATE, (_event, id: string, input: UpdateClassMeetingInput) => {
    if (!id) throw new Error('id is required');
    return updateClassMeeting(id, input);
  });

  ipcMain.handle(IPC.CLASS_MEETINGS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('id is required');
    deleteClassMeeting(id);
    deleteLinksForEntity('class_meeting', id);
  });
}
