// The preload script runs in a special context: it has access to Node/Electron
// APIs (specifically ipcRenderer), but it's isolated from the renderer page.
// contextBridge.exposeInMainWorld() is the ONLY safe way to pass data to the
// renderer. Anything not explicitly exposed here is invisible to renderer code.
//
// Security rule: never expose ipcRenderer itself — only wrap specific channels.

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPC } from './shared/types';
import type {
  WindowApi,
  CreateCourseInput,
  UpdateCourseInput,
  AssignmentStatus,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateClassMeetingInput,
  UpdateClassMeetingInput,
  CreateTermInput,
  UpdateTermInput,
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

  classMeetings: {
    list:   (filters?: { courseId?: string })            => ipcRenderer.invoke(IPC.CLASS_MEETINGS.LIST, filters),
    create: (input: CreateClassMeetingInput)             => ipcRenderer.invoke(IPC.CLASS_MEETINGS.CREATE, input),
    update: (id, input: UpdateClassMeetingInput)         => ipcRenderer.invoke(IPC.CLASS_MEETINGS.UPDATE, id, input),
    delete: (id)                                         => ipcRenderer.invoke(IPC.CLASS_MEETINGS.DELETE, id),
  },

  terms: {
    list:   ()                              => ipcRenderer.invoke(IPC.TERMS.LIST),
    create: (input: CreateTermInput)        => ipcRenderer.invoke(IPC.TERMS.CREATE, input),
    update: (id, input: UpdateTermInput)    => ipcRenderer.invoke(IPC.TERMS.UPDATE, id, input),
    delete: (id)                            => ipcRenderer.invoke(IPC.TERMS.DELETE, id),
  },

  appleMusic: {
    status:        ()                    => ipcRenderer.invoke(IPC.APPLE_MUSIC.STATUS),
    playback:      ()                    => ipcRenderer.invoke(IPC.APPLE_MUSIC.PLAYBACK),
    play:          ()                    => ipcRenderer.invoke(IPC.APPLE_MUSIC.PLAY),
    pause:         ()                    => ipcRenderer.invoke(IPC.APPLE_MUSIC.PAUSE),
    next:          ()                    => ipcRenderer.invoke(IPC.APPLE_MUSIC.NEXT),
    previous:      ()                    => ipcRenderer.invoke(IPC.APPLE_MUSIC.PREVIOUS),
    playlists:     ()                    => ipcRenderer.invoke(IPC.APPLE_MUSIC.PLAYLISTS),
    playPlaylist:  (id: string)          => ipcRenderer.invoke(IPC.APPLE_MUSIC.PLAY_PLAYLIST, id),
    searchLibrary: (query: string)       => ipcRenderer.invoke(IPC.APPLE_MUSIC.SEARCH_LIBRARY, query),
    playTrack:     (databaseId: string)  => ipcRenderer.invoke(IPC.APPLE_MUSIC.PLAY_TRACK, databaseId),
  },

  spotify: {
    status:          ()                  => ipcRenderer.invoke(IPC.SPOTIFY.STATUS),
    setClientId:     (clientId: string)  => ipcRenderer.invoke(IPC.SPOTIFY.SET_CLIENT_ID, clientId),
    connect:         (clientId: string)  => ipcRenderer.invoke(IPC.SPOTIFY.CONNECT, clientId),
    disconnect:      ()                  => ipcRenderer.invoke(IPC.SPOTIFY.DISCONNECT),
    playback:        ()                  => ipcRenderer.invoke(IPC.SPOTIFY.PLAYBACK),
    play:            (contextUri?: string) => ipcRenderer.invoke(IPC.SPOTIFY.PLAY, contextUri),
    pause:           ()                  => ipcRenderer.invoke(IPC.SPOTIFY.PAUSE),
    next:            ()                  => ipcRenderer.invoke(IPC.SPOTIFY.NEXT),
    previous:        ()                  => ipcRenderer.invoke(IPC.SPOTIFY.PREVIOUS),
    volume:          (percent: number)   => ipcRenderer.invoke(IPC.SPOTIFY.VOLUME, percent),
    userPlaylists:   ()                  => ipcRenderer.invoke(IPC.SPOTIFY.USER_PLAYLISTS),
    searchPlaylists: (query: string)     => ipcRenderer.invoke(IPC.SPOTIFY.SEARCH_PLAYLISTS, query),

    // Registers a one-shot listener for the auth-callback event that main sends
    // after processing the OAuth redirect. Returns a cleanup function.
    onAuthCallback: (cb: (success: boolean) => void) => {
      const listener = (_e: IpcRendererEvent, data: { success: boolean }) => cb(data.success);
      ipcRenderer.on('spotify:auth-callback', listener);
      return () => ipcRenderer.removeListener('spotify:auth-callback', listener);
    },
  },
};

// Exposes the api object as window.api in the renderer.
contextBridge.exposeInMainWorld('api', api);
