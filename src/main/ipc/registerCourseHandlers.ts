import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import { deleteLinksForEntity } from '../db/repositories/noteLinkRepo';
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
    if (input.gradeSections !== undefined && input.gradeSections !== null) {
      const sections = input.gradeSections;
      if (!Array.isArray(sections)) throw new Error('gradeSections must be an array');
      if (sections.length > 50) throw new Error('Too many grade sections (max 50)');
      for (const s of sections) {
        if (!s || typeof s !== 'object') throw new Error('Each grade section must be an object');
        if (typeof s.name !== 'string' || !s.name.trim()) {
          throw new Error('Each grade section needs a name');
        }
        if (typeof s.weight !== 'number' || !Number.isFinite(s.weight) || s.weight < 0 || s.weight > 100) {
          throw new Error(`Section "${s.name}" weight must be a number between 0 and 100`);
        }
        if (s.score !== null && (typeof s.score !== 'number' || !Number.isFinite(s.score) || s.score < 0 || s.score > 150)) {
          throw new Error(`Section "${s.name}" score must be null or a number between 0 and 150`);
        }
      }
    }
    return updateCourse(id, input);
  });

  ipcMain.handle(IPC.COURSES.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Course id is required');
    deleteCourse(id);
    deleteLinksForEntity('course', id);
  });
}
