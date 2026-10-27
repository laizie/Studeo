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
  CourseSnapshot,
  AssignmentSnapshot,
  StudySession,
  CreateCourseInput,
  UpdateCourseInput,
  AssignmentStatus,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateSubtaskInput,
  UpdateSubtaskInput,
  CreateClassMeetingInput,
  UpdateClassMeetingInput,
  CreateMeetingExceptionInput,
  CreateTermInput,
  UpdateTermInput,
  CreateStudySessionInput,
  UpdateStudySessionInput,
  CreateStudyBlockInput,
  UpdateStudyBlockInput,
  CreateNoteInput,
  UpdateNoteInput,
  CreateNoteLinkInput,
  NoteLinkEntity,
  SaveMediaInput,
  ReminderConfig,
  ApplyToSeriesInput,
  ApplyToTaskSeriesInput,
  FieldSet,
  NameSet,
  DateSet,
  CreateAssignmentBatchInput,
  CreateAssignmentSeriesInput,
  CreateTaskSeriesInput,
  ExtendAssignmentSeriesInput,
  ExtendTaskSeriesInput,
  LinkIntoSeriesInput,
  RestoreOccurrencesInput,
  RespaceSeriesInput,
  RespaceTasksInput,
  StopRepeatingInput,
  StopRepeatingTasksInput,
  RestoreTaskOccurrencesInput,
  ShiftTasksInput,
  ShiftAssignmentsInput,
  ReminderNavTarget,
  MiniTimerState,
  MiniTimerCommand,
} from './shared/types';

const api: WindowApi = {
  courses: {
    list:   ()                              => ipcRenderer.invoke(IPC.COURSES.LIST),
    get:    (id)                            => ipcRenderer.invoke(IPC.COURSES.GET, id),
    create: (input: CreateCourseInput)      => ipcRenderer.invoke(IPC.COURSES.CREATE, input),
    update: (id, input: UpdateCourseInput)  => ipcRenderer.invoke(IPC.COURSES.UPDATE, id, input),
    delete: (id)                            => ipcRenderer.invoke(IPC.COURSES.DELETE, id),
    restore: (snapshot: CourseSnapshot)     => ipcRenderer.invoke(IPC.COURSES.RESTORE, snapshot),
  },

  assignments: {
    list:   (filters?: { courseId?: string; status?: AssignmentStatus }) =>
      ipcRenderer.invoke(IPC.ASSIGNMENTS.LIST, filters),
    create:     (input: CreateAssignmentInput)      => ipcRenderer.invoke(IPC.ASSIGNMENTS.CREATE, input),
    createMany: (inputs: CreateAssignmentInput[])   => ipcRenderer.invoke(IPC.ASSIGNMENTS.CREATE_MANY, inputs),
    update:     (id, input: UpdateAssignmentInput)  => ipcRenderer.invoke(IPC.ASSIGNMENTS.UPDATE, id, input),
    delete:  (id)                               => ipcRenderer.invoke(IPC.ASSIGNMENTS.DELETE, id),
    restore: (snapshot: AssignmentSnapshot)     => ipcRenderer.invoke(IPC.ASSIGNMENTS.RESTORE, snapshot),
    shift:    (input: ShiftAssignmentsInput)    => ipcRenderer.invoke(IPC.ASSIGNMENTS.SHIFT, input),
    respace:  (input: RespaceSeriesInput)       => ipcRenderer.invoke(IPC.ASSIGNMENTS.RESPACE, input),
    setDates: (items: DateSet[])      => ipcRenderer.invoke(IPC.ASSIGNMENTS.SET_DATES, items),
    createBatch: (input: CreateAssignmentBatchInput) => ipcRenderer.invoke(IPC.ASSIGNMENTS.CREATE_BATCH, input),
    applyToSeries: (input: ApplyToSeriesInput) => ipcRenderer.invoke(IPC.ASSIGNMENTS.APPLY_SERIES, input),
    setFields:  (items: FieldSet[])             => ipcRenderer.invoke(IPC.ASSIGNMENTS.SET_FIELDS, items),
  },

  assignmentSeries: {
    list:   (filters?: { courseId?: string })            => ipcRenderer.invoke(IPC.ASSIGNMENT_SERIES.LIST, filters),
    create: (input: CreateAssignmentSeriesInput)         => ipcRenderer.invoke(IPC.ASSIGNMENT_SERIES.CREATE, input),
    extend: (input: ExtendAssignmentSeriesInput)         => ipcRenderer.invoke(IPC.ASSIGNMENT_SERIES.EXTEND, input),
    link:   (input: LinkIntoSeriesInput)                 => ipcRenderer.invoke(IPC.ASSIGNMENT_SERIES.LINK, input),
    stopFrom: (input: StopRepeatingInput)                => ipcRenderer.invoke(IPC.ASSIGNMENT_SERIES.STOP_FROM, input),
    restoreOccurrences: (input: RestoreOccurrencesInput) => ipcRenderer.invoke(IPC.ASSIGNMENT_SERIES.RESTORE_OCCURRENCES, input),
    delete: (id)                                         => ipcRenderer.invoke(IPC.ASSIGNMENT_SERIES.DELETE, id),
  },

  tasks: {
    list:       ()                             => ipcRenderer.invoke(IPC.TASKS.LIST),
    create:     (input: CreateTaskInput)       => ipcRenderer.invoke(IPC.TASKS.CREATE, input),
    createMany: (inputs: CreateTaskInput[])    => ipcRenderer.invoke(IPC.TASKS.CREATE_MANY, inputs),
    update:     (id, input: UpdateTaskInput)   => ipcRenderer.invoke(IPC.TASKS.UPDATE, id, input),
    delete:     (id)                           => ipcRenderer.invoke(IPC.TASKS.DELETE, id),
    shift:      (input: ShiftTasksInput)       => ipcRenderer.invoke(IPC.TASKS.SHIFT, input),
    respace:    (input: RespaceTasksInput)     => ipcRenderer.invoke(IPC.TASKS.RESPACE, input),
    setDates:   (items: DateSet[])             => ipcRenderer.invoke(IPC.TASKS.SET_DATES, items),
    applyToSeries: (input: ApplyToTaskSeriesInput) => ipcRenderer.invoke(IPC.TASKS.APPLY_SERIES, input),
    setNames:   (items: NameSet[])             => ipcRenderer.invoke(IPC.TASKS.SET_NAMES, items),
  },

  taskSeries: {
    list:   ()                                 => ipcRenderer.invoke(IPC.TASK_SERIES.LIST),
    create: (input: CreateTaskSeriesInput)     => ipcRenderer.invoke(IPC.TASK_SERIES.CREATE, input),
    extend: (input: ExtendTaskSeriesInput)     => ipcRenderer.invoke(IPC.TASK_SERIES.EXTEND, input),
    stopFrom: (input: StopRepeatingTasksInput) => ipcRenderer.invoke(IPC.TASK_SERIES.STOP_FROM, input),
    restoreOccurrences: (input: RestoreTaskOccurrencesInput) => ipcRenderer.invoke(IPC.TASK_SERIES.RESTORE_OCCURRENCES, input),
    delete: (id)                               => ipcRenderer.invoke(IPC.TASK_SERIES.DELETE, id),
  },

  subtasks: {
    list:   (filters?: { assignmentId?: string })  => ipcRenderer.invoke(IPC.SUBTASKS.LIST, filters),
    create: (input: CreateSubtaskInput)            => ipcRenderer.invoke(IPC.SUBTASKS.CREATE, input),
    update: (id, input: UpdateSubtaskInput)        => ipcRenderer.invoke(IPC.SUBTASKS.UPDATE, id, input),
    delete: (id)                                   => ipcRenderer.invoke(IPC.SUBTASKS.DELETE, id),
  },

  classMeetings: {
    list:   (filters?: { courseId?: string })            => ipcRenderer.invoke(IPC.CLASS_MEETINGS.LIST, filters),
    create: (input: CreateClassMeetingInput)             => ipcRenderer.invoke(IPC.CLASS_MEETINGS.CREATE, input),
    update: (id, input: UpdateClassMeetingInput)         => ipcRenderer.invoke(IPC.CLASS_MEETINGS.UPDATE, id, input),
    delete: (id)                                         => ipcRenderer.invoke(IPC.CLASS_MEETINGS.DELETE, id),
  },

  meetingExceptions: {
    list:   (filters?: { meetingId?: string })       => ipcRenderer.invoke(IPC.MEETING_EXCEPTIONS.LIST, filters),
    create: (input: CreateMeetingExceptionInput)     => ipcRenderer.invoke(IPC.MEETING_EXCEPTIONS.CREATE, input),
    delete: (id)                                     => ipcRenderer.invoke(IPC.MEETING_EXCEPTIONS.DELETE, id),
  },

  terms: {
    list:   ()                              => ipcRenderer.invoke(IPC.TERMS.LIST),
    create: (input: CreateTermInput)        => ipcRenderer.invoke(IPC.TERMS.CREATE, input),
    update: (id, input: UpdateTermInput)    => ipcRenderer.invoke(IPC.TERMS.UPDATE, id, input),
    delete: (id)                            => ipcRenderer.invoke(IPC.TERMS.DELETE, id),
  },

  studySessions: {
    list:   ()                                       => ipcRenderer.invoke(IPC.STUDY_SESSIONS.LIST),
    create: (input: CreateStudySessionInput)         => ipcRenderer.invoke(IPC.STUDY_SESSIONS.CREATE, input),
    update: (id, input: UpdateStudySessionInput)     => ipcRenderer.invoke(IPC.STUDY_SESSIONS.UPDATE, id, input),
    delete:  (id)                                    => ipcRenderer.invoke(IPC.STUDY_SESSIONS.DELETE, id),
    restore: (session: StudySession)                 => ipcRenderer.invoke(IPC.STUDY_SESSIONS.RESTORE, session),
  },

  studyBlocks: {
    list:       ()                                   => ipcRenderer.invoke(IPC.STUDY_BLOCKS.LIST),
    createMany: (inputs: CreateStudyBlockInput[])    => ipcRenderer.invoke(IPC.STUDY_BLOCKS.CREATE_MANY, inputs),
    update:     (id, input: UpdateStudyBlockInput)   => ipcRenderer.invoke(IPC.STUDY_BLOCKS.UPDATE, id, input),
    delete:     (id)                                 => ipcRenderer.invoke(IPC.STUDY_BLOCKS.DELETE, id),
    deleteForAssignment: (assignmentId: string)      => ipcRenderer.invoke(IPC.STUDY_BLOCKS.DELETE_FOR_ASSIGNMENT, assignmentId),
  },

  notes: {
    list:   (filters?: { archived?: boolean })  => ipcRenderer.invoke(IPC.NOTES.LIST, filters),
    listWithCourse: ()                          => ipcRenderer.invoke(IPC.NOTES.LIST_WITH_COURSE),
    listLoose: ()                               => ipcRenderer.invoke(IPC.NOTES.LIST_LOOSE),
    children: (parentId: string)                => ipcRenderer.invoke(IPC.NOTES.CHILDREN, parentId),
    get:    (id)                                => ipcRenderer.invoke(IPC.NOTES.GET, id),
    search: (query: string)                     => ipcRenderer.invoke(IPC.NOTES.SEARCH, query),
    create: (input: CreateNoteInput)            => ipcRenderer.invoke(IPC.NOTES.CREATE, input),
    update: (id, input: UpdateNoteInput)        => ipcRenderer.invoke(IPC.NOTES.UPDATE, id, input),
    delete: (id)                                => ipcRenderer.invoke(IPC.NOTES.DELETE, id),
    listVersions:   (noteId: string)                  => ipcRenderer.invoke(IPC.NOTES.LIST_VERSIONS, noteId),
    restoreVersion: (noteId: string, versionId: string) => ipcRenderer.invoke(IPC.NOTES.RESTORE_VERSION, noteId, versionId),
  },

  noteLinks: {
    listForNote:    (noteId: string)                                   => ipcRenderer.invoke(IPC.NOTE_LINKS.LIST_FOR_NOTE, noteId),
    notesForEntity: (entityType: NoteLinkEntity, entityId: string, occurrenceDate?: string) => ipcRenderer.invoke(IPC.NOTE_LINKS.NOTES_FOR_ENTITY, entityType, entityId, occurrenceDate),
    create:         (input: CreateNoteLinkInput)                       => ipcRenderer.invoke(IPC.NOTE_LINKS.CREATE, input),
    setPinned:      (linkId: string, pinned: boolean)                  => ipcRenderer.invoke(IPC.NOTE_LINKS.SET_PINNED, linkId, pinned),
    delete:         (id)                                               => ipcRenderer.invoke(IPC.NOTE_LINKS.DELETE, id),
  },

  media: {
    save: (input: SaveMediaInput) => ipcRenderer.invoke(IPC.MEDIA.SAVE, input),
  },

  reminders: {
    configure: (config: ReminderConfig) => ipcRenderer.invoke(IPC.REMINDERS.CONFIGURE, config),
    test:      ()                       => ipcRenderer.invoke(IPC.REMINDERS.TEST),

    // Subscribe to deep-link pushes that main sends when a reminder is clicked.
    // Same shape as spotify.onAuthCallback / app.onFullscreenChange: wrap one
    // channel, hand back an unsubscribe so the renderer can clean up.
    onNavigate: (cb: (target: ReminderNavTarget) => void) => {
      const listener = (_e: IpcRendererEvent, target: ReminderNavTarget) => cb(target);
      ipcRenderer.on(IPC.REMINDERS.NAVIGATE, listener);
      return () => ipcRenderer.removeListener(IPC.REMINDERS.NAVIGATE, listener);
    },
  },

  app: {
    revealData: () => ipcRenderer.invoke(IPC.APP.REVEAL_DATA),
    checkForUpdates: () => ipcRenderer.invoke(IPC.APP.CHECK_UPDATES),
    backupData: () => ipcRenderer.invoke(IPC.APP.BACKUP_DATA),
    restoreData: () => ipcRenderer.invoke(IPC.APP.RESTORE_DATA),
    sweepAssets: () => ipcRenderer.invoke(IPC.APP.SWEEP_ASSETS),
    listBackups: () => ipcRenderer.invoke(IPC.APP.LIST_BACKUPS),
    revealBackups: () => ipcRenderer.invoke(IPC.APP.REVEAL_BACKUPS),
    getLoginItem: () => ipcRenderer.invoke(IPC.APP.GET_LOGIN_ITEM),
    setLoginItem: (enabled: boolean) => ipcRenderer.invoke(IPC.APP.SET_LOGIN_ITEM, enabled),
    // Read once, synchronously, at preload time. The settings store's init reads this to
    // apply saved prefs (e.g. theme) before the first paint — no flash of the defaults.
    initialSettings: ipcRenderer.sendSync(IPC.APP.GET_SETTINGS) as Record<string, string>,
    setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC.APP.SET_SETTING, key, value),
    setFullscreen: (on: boolean) => ipcRenderer.invoke(IPC.APP.SET_FULLSCREEN, on),
    isFullscreen: () => ipcRenderer.invoke(IPC.APP.GET_FULLSCREEN) as Promise<boolean>,
    onFullscreenChange: (cb: (isFullscreen: boolean) => void) => {
      const listener = (_e: IpcRendererEvent, data: { isFullscreen: boolean }) => cb(data.isFullscreen);
      ipcRenderer.on('app:fullscreen-changed', listener);
      return () => ipcRenderer.removeListener('app:fullscreen-changed', listener);
    },
  },

  // The floating Pomodoro pop-out. Both windows load this same preload, so both halves
  // of the relay are here; which half a window uses depends on which one it is (the
  // main window publishes and listens for commands, the pop-out does the reverse).
  // `send` rather than `invoke` for the two hot paths — neither side has anything to
  // wait for, and the timer must never block on the relay.
  miniTimer: {
    open:    () => ipcRenderer.invoke(IPC.MINI_TIMER.OPEN),
    close:   () => ipcRenderer.invoke(IPC.MINI_TIMER.CLOSE),
    toggle:  () => ipcRenderer.invoke(IPC.MINI_TIMER.TOGGLE) as Promise<boolean>,
    isOpen:  () => ipcRenderer.invoke(IPC.MINI_TIMER.IS_OPEN) as Promise<boolean>,
    onOpenChanged: (cb: (isOpen: boolean) => void) => {
      const listener = (_e: IpcRendererEvent, isOpen: boolean) => cb(isOpen);
      ipcRenderer.on(IPC.MINI_TIMER.OPEN_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.MINI_TIMER.OPEN_CHANGED, listener);
    },

    publish: (state: MiniTimerState) => ipcRenderer.send(IPC.MINI_TIMER.PUBLISH, state),
    onCommand: (cb: (command: MiniTimerCommand) => void) => {
      const listener = (_e: IpcRendererEvent, command: MiniTimerCommand) => cb(command);
      ipcRenderer.on(IPC.MINI_TIMER.COMMAND, listener);
      return () => ipcRenderer.removeListener(IPC.MINI_TIMER.COMMAND, listener);
    },

    getState: () => ipcRenderer.invoke(IPC.MINI_TIMER.GET_STATE) as Promise<MiniTimerState | null>,
    onState: (cb: (state: MiniTimerState) => void) => {
      const listener = (_e: IpcRendererEvent, state: MiniTimerState) => cb(state);
      ipcRenderer.on(IPC.MINI_TIMER.STATE, listener);
      return () => ipcRenderer.removeListener(IPC.MINI_TIMER.STATE, listener);
    },
    command:   (command: MiniTimerCommand) => ipcRenderer.send(IPC.MINI_TIMER.COMMAND, command),
    closeSelf: () => ipcRenderer.invoke(IPC.MINI_TIMER.CLOSE),
    showMain:  () => ipcRenderer.invoke(IPC.MINI_TIMER.SHOW_MAIN),
  },

  feeds: {
    fetchIcs: (url: string) => ipcRenderer.invoke(IPC.FEEDS.FETCH_ICS, url),
  },

  pdf: {
    pick: (title?: string) => ipcRenderer.invoke(IPC.PDF.PICK, title),
  },

  appleReminders: {
    status:             ()                 => ipcRenderer.invoke(IPC.APPLE_REMINDERS.STATUS),
    setEnabled:         (enabled: boolean) => ipcRenderer.invoke(IPC.APPLE_REMINDERS.SET_ENABLED, enabled),
    setRemoveCompleted: (remove: boolean)  => ipcRenderer.invoke(IPC.APPLE_REMINDERS.SET_REMOVE_COMPLETED, remove),
    syncNow:            ()                 => ipcRenderer.invoke(IPC.APPLE_REMINDERS.SYNC_NOW),
    rebuild:            ()                 => ipcRenderer.invoke(IPC.APPLE_REMINDERS.REBUILD),
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
    queue:           ()                  => ipcRenderer.invoke(IPC.SPOTIFY.QUEUE),
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
