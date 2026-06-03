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
}

export interface CreateAssignmentInput {
  courseId: string;
  name: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  dueDate: string;
  notes?: string;
}

export interface UpdateAssignmentInput {
  name?: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  dueDate?: string;
  notes?: string | null;
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
    LIST:   'assignments:list',
    CREATE: 'assignments:create',
    UPDATE: 'assignments:update',
    DELETE: 'assignments:delete',
  },
  TASKS: {
    LIST:   'tasks:list',
    CREATE: 'tasks:create',
    UPDATE: 'tasks:update',
    DELETE: 'tasks:delete',
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
    update(id: string, input: UpdateAssignmentInput): Promise<Assignment>;
    delete(id: string): Promise<void>;
  };
  tasks: {
    list(): Promise<Task[]>;
    create(input: CreateTaskInput): Promise<Task>;
    update(id: string, input: UpdateTaskInput): Promise<Task>;
    delete(id: string): Promise<void>;
  };
}
