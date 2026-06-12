// ─── Domain models ────────────────────────────────────────────────────────────
// These mirror the SQLite table shapes exactly (snake_case column names).

export interface Term {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface Course {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  building: string | null;
  term_id: string | null;
  /** JSON: {"Homework": 30, "Exam": 40} — parse with parseGradeWeights() in shared/grades.ts. */
  grade_weights: string | null;
  created_at: string;
}

// Fixed list from PRD §7 — only change here, never as ad-hoc strings.
export type AssignmentType =
  | 'Assignment'
  | 'Homework'
  | 'Quiz'
  | 'Exam'
  | 'Project'
  | 'Lab'
  | 'Reading'
  | 'Paper';

export const ASSIGNMENT_TYPES: AssignmentType[] = [
  'Assignment', 'Homework', 'Quiz', 'Exam',
  'Project', 'Lab', 'Reading', 'Paper',
];

export type AssignmentStatus = 'not_started' | 'in_progress' | 'completed';

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  'not_started', 'in_progress', 'completed',
];

export interface Assignment {
  id: string;
  course_id: string;
  name: string;
  type: AssignmentType;
  status: AssignmentStatus;
  due_date: string;
  notes: string | null;
  /** Grade earned ("18 out of 20"). Both null until the user records one. */
  score: number | null;
  points_possible: number | null;
  created_at: string;
}

// A checklist step inside an assignment ("Essay" → outline, draft, revise).
export interface Subtask {
  id: string;
  assignment_id: string;
  name: string;
  completed: 0 | 1; // SQLite has no boolean type
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  name: string;
  status: AssignmentStatus;
  due_date: string;
  created_at: string;
}

export interface ClassMeeting {
  id: string;
  course_id: string;
  day_of_week: number; // 0 = Sunday … 6 = Saturday
  start_time: string;  // "09:35"
  end_time: string;    // "10:50"
  location: string | null;
}

// A one-off change to a recurring class meeting: "no class Nov 26" (cancelled)
// or "moved to 2 PM in Room 110 that day" (moved). The recurring rule stays
// untouched; exceptions override single occurrences by date.
export type MeetingExceptionKind = 'cancelled' | 'moved';

export interface MeetingException {
  id: string;
  meeting_id: string;
  date: string; // YYYY-MM-DD of the affected occurrence
  kind: MeetingExceptionKind;
  new_start_time: string | null; // "HH:MM" — only set when kind = 'moved'
  new_end_time: string | null;
  new_location: string | null;
}

export interface StudySession {
  id: string;
  started_at: string;
  duration_seconds: number;
  kind: 'focus' | 'short_break' | 'long_break';
  course_id: string | null;
}

// ─── Input types ──────────────────────────────────────────────────────────────
// Separate from the domain models so we never accidentally pass DB row shapes
// as creation inputs (different fields, no id/created_at yet).

export interface ReminderConfig {
  enabled: boolean;
  /** Minutes before a class meeting's start time to fire the notification. */
  leadMinutes: number;
  /** Daily due-date digest: one notification listing what's due today & tomorrow. */
  dueDigestEnabled: boolean;
  /** Local time ("HH:MM", 24h) at which the daily due digest fires. */
  dueDigestTime: string;
}

export interface CreateStudySessionInput {
  startedAt: string;        // ISO timestamp (UTC) — when the session began
  durationSeconds: number;
  kind: 'focus' | 'short_break' | 'long_break';
  courseId?: string;
}

export interface CreateCourseInput {
  name: string;
  abbreviation: string;
  color: string;
  building?: string;
  termId?: string;
}

export interface UpdateCourseInput {
  name?: string;
  abbreviation?: string;
  color?: string;
  building?: string | null;
  termId?: string | null;
  /** Map of assignment type → weight percent; null clears the scheme. */
  gradeWeights?: Record<string, number> | null;
}

export interface CreateAssignmentInput {
  courseId: string;
  name: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  dueDate: string;
  notes?: string;
  score?: number | null;
  pointsPossible?: number | null;
}

export interface UpdateAssignmentInput {
  name?: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  dueDate?: string;
  notes?: string | null;
  score?: number | null;
  pointsPossible?: number | null;
}

export interface CreateSubtaskInput {
  assignmentId: string;
  name: string;
}

export interface UpdateSubtaskInput {
  name?: string;
  completed?: boolean;
}

export interface CreateTaskInput {
  name: string;
  status?: AssignmentStatus;
  dueDate: string;
}

export interface UpdateTaskInput {
  name?: string;
  status?: AssignmentStatus;
  dueDate?: string;
}

export interface CreateMeetingExceptionInput {
  meetingId: string;
  date: string; // YYYY-MM-DD
  kind: MeetingExceptionKind;
  newStartTime?: string;
  newEndTime?: string;
  newLocation?: string;
}

export interface CreateClassMeetingInput {
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface UpdateClassMeetingInput {
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  location?: string | null;
}

export interface CreateTermInput {
  name: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateTermInput {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
}

// ─── Spotify types ────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  albumName: string;
  albumArt: string | null;
  durationMs: number;
  uri: string;
}

export interface SpotifyPlaybackState {
  isPlaying: boolean;
  track: SpotifyTrack | null;
  progressMs: number;
  volumePercent: number;
  deviceName: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  trackCount: number;
  uri: string;
}

export type SpotifyConnectionStatus =
  | { connected: false; clientIdConfigured: boolean }
  | { connected: true; displayName: string; email: string };

// ─── Apple Music types ────────────────────────────────────────────────────────

export interface AppleMusicTrack {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  artworkUrl: string | null;
  durationMs: number;
}

export interface AppleMusicPlaylist {
  id: string;
  name: string;
  description: string | null;
  artworkUrl: string | null;
  trackCount: number;
  isLibrary: boolean;
}

// ─── IPC channel names ────────────────────────────────────────────────────────
// Defined once as constants so main/preload/renderer all use the exact same
// string — a typo anywhere would be a compile error instead of a silent bug.

export const IPC = {
  COURSES: {
    LIST:   'courses:list',
    GET:    'courses:get',
    CREATE: 'courses:create',
    UPDATE: 'courses:update',
    DELETE: 'courses:delete',
  },
  ASSIGNMENTS: {
    LIST:        'assignments:list',
    CREATE:      'assignments:create',
    CREATE_MANY: 'assignments:create-many',
    UPDATE:      'assignments:update',
    DELETE:      'assignments:delete',
  },
  SUBTASKS: {
    LIST:   'subtasks:list',
    CREATE: 'subtasks:create',
    UPDATE: 'subtasks:update',
    DELETE: 'subtasks:delete',
  },
  TASKS: {
    LIST:   'tasks:list',
    CREATE: 'tasks:create',
    UPDATE: 'tasks:update',
    DELETE: 'tasks:delete',
  },
  CLASS_MEETINGS: {
    LIST:   'class_meetings:list',
    CREATE: 'class_meetings:create',
    UPDATE: 'class_meetings:update',
    DELETE: 'class_meetings:delete',
  },
  MEETING_EXCEPTIONS: {
    LIST:   'meeting_exceptions:list',
    CREATE: 'meeting_exceptions:create',
    DELETE: 'meeting_exceptions:delete',
  },
  TERMS: {
    LIST:   'terms:list',
    CREATE: 'terms:create',
    UPDATE: 'terms:update',
    DELETE: 'terms:delete',
  },
  STUDY_SESSIONS: {
    LIST:   'study_sessions:list',
    CREATE: 'study_sessions:create',
  },
  REMINDERS: {
    CONFIGURE: 'reminders:configure',
    TEST:      'reminders:test',
  },
  APPLE_MUSIC: {
    STATUS:         'apple_music:status',
    PLAYBACK:       'apple_music:playback',
    PLAY:           'apple_music:play',
    PAUSE:          'apple_music:pause',
    NEXT:           'apple_music:next',
    PREVIOUS:       'apple_music:previous',
    PLAYLISTS:      'apple_music:playlists',
    PLAY_PLAYLIST:  'apple_music:play-playlist',
    SEARCH_LIBRARY: 'apple_music:search-library',
    PLAY_TRACK:     'apple_music:play-track',
  },
  SPOTIFY: {
    STATUS:           'spotify:status',
    SET_CLIENT_ID:    'spotify:set-client-id',
    CONNECT:          'spotify:connect',
    DISCONNECT:       'spotify:disconnect',
    PLAYBACK:         'spotify:playback',
    PLAY:             'spotify:play',
    PAUSE:            'spotify:pause',
    NEXT:             'spotify:next',
    PREVIOUS:         'spotify:previous',
    VOLUME:           'spotify:volume',
    USER_PLAYLISTS:   'spotify:user-playlists',
    SEARCH_PLAYLISTS: 'spotify:search-playlists',
  },
} as const;

// ─── window.api contract ──────────────────────────────────────────────────────
// This interface is implemented by preload.ts and consumed by the renderer.
// Keeping it in shared/ means both sides are typed against the same shape.

export interface WindowApi {
  courses: {
    list(): Promise<Course[]>;
    get(id: string): Promise<Course | null>;
    create(input: CreateCourseInput): Promise<Course>;
    update(id: string, input: UpdateCourseInput): Promise<Course>;
    delete(id: string): Promise<void>;
  };
  assignments: {
    list(filters?: { courseId?: string; status?: AssignmentStatus }): Promise<Assignment[]>;
    create(input: CreateAssignmentInput): Promise<Assignment>;
    /** Atomic batch insert — all rows save or none do (Day-One Setup). */
    createMany(inputs: CreateAssignmentInput[]): Promise<Assignment[]>;
    update(id: string, input: UpdateAssignmentInput): Promise<Assignment>;
    delete(id: string): Promise<void>;
  };
  subtasks: {
    list(filters?: { assignmentId?: string }): Promise<Subtask[]>;
    create(input: CreateSubtaskInput): Promise<Subtask>;
    update(id: string, input: UpdateSubtaskInput): Promise<Subtask>;
    delete(id: string): Promise<void>;
  };
  tasks: {
    list(): Promise<Task[]>;
    create(input: CreateTaskInput): Promise<Task>;
    update(id: string, input: UpdateTaskInput): Promise<Task>;
    delete(id: string): Promise<void>;
  };
  classMeetings: {
    list(filters?: { courseId?: string }): Promise<ClassMeeting[]>;
    create(input: CreateClassMeetingInput): Promise<ClassMeeting>;
    update(id: string, input: UpdateClassMeetingInput): Promise<ClassMeeting>;
    delete(id: string): Promise<void>;
  };
  meetingExceptions: {
    list(filters?: { meetingId?: string }): Promise<MeetingException[]>;
    /** Creating a second exception for the same meeting+date replaces the first. */
    create(input: CreateMeetingExceptionInput): Promise<MeetingException>;
    delete(id: string): Promise<void>;
  };
  terms: {
    list(): Promise<Term[]>;
    create(input: CreateTermInput): Promise<Term>;
    update(id: string, input: UpdateTermInput): Promise<Term>;
    delete(id: string): Promise<void>;
  };
  studySessions: {
    list(): Promise<StudySession[]>;
    create(input: CreateStudySessionInput): Promise<StudySession>;
  };
  reminders: {
    configure(config: ReminderConfig): Promise<void>;
    /** Fire a sample desktop notification so the user can verify permissions. */
    test(): Promise<{ supported: boolean }>;
  };
  appleMusic: {
    status():                        Promise<{ running: boolean; authorized: boolean }>;
    playback():                      Promise<{ isPlaying: boolean; progressMs: number; track: AppleMusicTrack | null } | null>;
    play():                          Promise<{ ok: boolean; error?: string }>;
    pause():                         Promise<{ ok: boolean; error?: string }>;
    next():                          Promise<{ ok: boolean; error?: string }>;
    previous():                      Promise<{ ok: boolean; error?: string }>;
    playlists():                     Promise<AppleMusicPlaylist[]>;
    playPlaylist(id: string):        Promise<{ ok: boolean; error?: string }>;
    searchLibrary(query: string):    Promise<AppleMusicTrack[]>;
    playTrack(databaseId: string):   Promise<{ ok: boolean; error?: string }>;
  };
  spotify: {
    status(): Promise<SpotifyConnectionStatus>;
    setClientId(clientId: string): Promise<{ ok: boolean }>;
    connect(clientId: string): Promise<{ ok: boolean }>;
    disconnect(): Promise<{ ok: boolean }>;
    playback(): Promise<SpotifyPlaybackState | null>;
    play(contextUri?: string): Promise<{ ok: boolean; error?: string }>;
    pause(): Promise<{ ok: boolean; error?: string }>;
    next(): Promise<{ ok: boolean; error?: string }>;
    previous(): Promise<{ ok: boolean; error?: string }>;
    volume(percent: number): Promise<{ ok: boolean; error?: string }>;
    userPlaylists(): Promise<SpotifyPlaylist[]>;
    searchPlaylists(query: string): Promise<SpotifyPlaylist[]>;
    onAuthCallback(cb: (success: boolean) => void): () => void;
  };
}
