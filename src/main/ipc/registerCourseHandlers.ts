import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateCourseInput, UpdateCourseInput } from '../../shared/types';
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from '../db/repositories/courseRepo';

export function registerCourseHandlers(): void {
  ipcMain.handle(IPC.COURSES.LIST, () => listCourses());

  ipcMain.handle(IPC.COURSES.GET, (_event, id: string) => getCourse(id));

  ipcMain.handle(IPC.COURSES.CREATE, (_event, input: CreateCourseInput) => {
    if (!input.name?.trim())         throw new Error('Course name is required');
    if (!input.abbreviation?.trim()) throw new Error('Abbreviation is required');
    if (!input.color)                throw new Error('Color is required');
    return createCourse(input);
  });

  ipcMain.handle(IPC.COURSES.UPDATE, (_event, id: string, input: UpdateCourseInput) => {
    if (!id) throw new Error('Course id is required');
    return updateCourse(id, input);
  });

  ipcMain.handle(IPC.COURSES.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Course id is required');
    deleteCourse(id);
  });
}
