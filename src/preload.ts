// The preload script runs in a special context: it has access to Node/Electron
// APIs (specifically ipcRenderer), but it's isolated from the renderer page.
// contextBridge.exposeInMainWorld() is the ONLY safe way to pass data to the
// renderer. Anything not explicitly exposed here is invisible to renderer code.
//
// Security rule: never expose ipcRenderer itself — only wrap specific channels.

import { contextBridge, ipcRenderer } from 'electron';
import type { WindowApi } from './shared/types';
import { IPC } from './shared/types';
import type {
  CreateCourseInput,
  UpdateCourseInput,
  AssignmentStatus,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  CreateTaskInput,
  UpdateTaskInput,
} from './shared/types';

const api: WindowApi = {
  courses: {
    list:   ()                              => ipcRenderer.invoke(IPC.COURSES.LIST),
    get:    (id)                            => ipcRenderer.invoke(IPC.COURSES.GET, id),
    create: (input: CreateCourseInput)      => ipcRenderer.invoke(IPC.COURSES.CREATE, input),
    update: (id, input: UpdateCourseInput)  => ipcRenderer.invoke(IPC.COURSES.UPDATE, id, input),
    delete: (id)                            => ipcRenderer.invoke(IPC.COURSES.DELETE, id),
  },

  assignments: {
    list:   (filters?: { courseId?: string; status?: AssignmentStatus }) =>
      ipcRenderer.invoke(IPC.ASSIGNMENTS.LIST, filters),
    create: (input: CreateAssignmentInput)      => ipcRenderer.invoke(IPC.ASSIGNMENTS.CREATE, input),
    update: (id, input: UpdateAssignmentInput)  => ipcRenderer.invoke(IPC.ASSIGNMENTS.UPDATE, id, input),
    delete: (id)                                => ipcRenderer.invoke(IPC.ASSIGNMENTS.DELETE, id),
  },

  tasks: {
    list:   ()                             => ipcRenderer.invoke(IPC.TASKS.LIST),
    create: (input: CreateTaskInput)       => ipcRenderer.invoke(IPC.TASKS.CREATE, input),
    update: (id, input: UpdateTaskInput)   => ipcRenderer.invoke(IPC.TASKS.UPDATE, id, input),
    delete: (id)                           => ipcRenderer.invoke(IPC.TASKS.DELETE, id),
  },
};

// Exposes the api object as window.api in the renderer.
contextBridge.exposeInMainWorld('api', api);
