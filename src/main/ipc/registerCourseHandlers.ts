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
    if (input.gradeWeights !== undefined && input.gradeWeights !== null) {
      if (typeof input.gradeWeights !== 'object' || Array.isArray(input.gradeWeights)) {
        throw new Error('gradeWeights must be an object of type → percent');
      }
      for (const [key, value] of Object.entries(input.gradeWeights)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
          throw new Error(`gradeWeights.${key} must be a number between 0 and 100`);
        }
      }
    }
    return updateCourse(id, input);
  });

  ipcMain.handle(IPC.COURSES.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Course id is required');
    deleteCourse(id);
  });
}
