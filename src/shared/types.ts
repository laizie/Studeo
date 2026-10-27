// The pop-out timer's wire types live in shared/pomodoro.ts, beside the phase
// constants they describe; the window.api contract below needs them, so they're
// imported and re-exported here rather than duplicated.
import type { MiniTimerState, MiniTimerCommand } from './pomodoro';
export type { MiniTimerState, MiniTimerCommand };

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
  /** JSON GradeSection[] — custom grade sections with weights/scores. Parse with
   *  parseGradeSections() in shared/grades.ts (also reads the legacy {type: weight} shape). */
  grade_weights: string | null;
  created_at: string;
}

// A custom grade section in a course's grading scheme: a named bucket with a
// weight and (once you have it) your score. Stored as a JSON array in
// courses.grade_weights. Lets a syllabus model "Exam 1 / Exam 2 / Final / …"
// that the fixed assignment types can't express.
export interface GradeSection {
  id: string;
  name: string;
  /** Relative weight percent — normalized over the total, need not sum to 100. */
  weight: number;
  /** Your achieved score (0–100), or null when not graded/taken yet. */
  score: number | null;
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
  /** Optional time of day, "HH:MM" (24h). Null = all-day. Affects display + intra-day
   *  sort only; the date still governs urgency (see shared/deadlines.ts). */
  due_time: string | null;
  notes: string | null;
  /** Grade earned ("18 out of 20"). Both null until the user records one. */
  score: number | null;
  points_possible: number | null;
  /** ISO/UTC timestamp of when status last became 'completed'; null otherwise.
   *  Set/cleared by the repo on status transitions — never authored directly.
   *  Powers time-windowed views like the Weekly Review's "what got done". */
  completed_at: string | null;
  /** The repeating series this occurrence came from, or null for a one-off.
   *  Nulled (not deleted) when the series is dropped — see AssignmentSeries. */
  series_id: string | null;
  /** 1-based position within the series; null for a one-off. Deliberately NOT
   *  derived from due_date: dates are exactly what gets shifted around, so
   *  "this and later" has to mean "later in the series", not "later on the
   *  calendar". Moving occurrence 5 past 6 doesn't renumber anything. */
  series_index: number | null;
  created_at: string;
}

/**
 * A repeating assignment ("Homework, every week until May 1"). The series row
 * records what was *asked for*; the occurrences are ordinary `assignments` rows
 * that carry their own status, score, subtasks and study blocks.
 *
 * It is bookkeeping, not a constraint. Moving one occurrence doesn't update the
 * rule and nothing re-syncs — so the rule is a record of intent, and the rows
 * stay the truth. That asymmetry is what keeps this simple.
 *
 * Contrast class_meetings/meeting_exceptions, where the rule IS the truth and
 * exceptions override it per date. A class occurrence carries no state of its
 * own; an assignment occurrence carries all of it, so it has to be a real row.
 */
export interface AssignmentSeries {
  id: string;
  course_id: string;
  /** The first occurrence's name as typed ("Homework 1"); later ones are
   *  numbered from it by shared/repeat.ts. */
  name_template: string;
  type: AssignmentType;
  /** 1 = weekly, 2 = every two weeks. */
  interval_weeks: number;
  anchor_date: string; // YYYY-MM-DD of the first occurrence
  until_date: string;  // last date an occurrence may land on (inclusive)
  due_time: string | null;
  created_at: string;
}

/**
 * How far an edit to one occurrence reaches. 'one' is always the default —
 * silently rewriting a whole semester because the user edited one row is the
 * mistake every calendar app makes once.
 */
export type SeriesScope = 'one' | 'this_and_later' | 'all';

export const SERIES_SCOPES: SeriesScope[] = ['one', 'this_and_later', 'all'];

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
  /** ISO/UTC timestamp of when status last became 'completed'; null otherwise.
   *  Set/cleared by the repo on status transitions (mirrors Assignment). */
  completed_at: string | null;
  /** The repeating series this occurrence came from, or null for a one-off.
   *  Nulled (not deleted) when the series is dropped — see TaskSeries. */
  series_id: string | null;
  /** 1-based position within the series; null for a one-off. Not derived from
   *  due_date, for the same reason as Assignment.series_index: dates are what
   *  gets shifted, so "later" has to mean later in the series. */
  series_index: number | null;
  created_at: string;
}

/**
 * A repeating task ("water the plants, every week until May"). The same shape as
 * AssignmentSeries minus the things tasks don't have — no course, no type, no
 * time of day — because a task is deliberately the lighter of the two.
 *
 * Same bargain as well: the rule is bookkeeping, the rows are the truth, and
 * dropping the rule leaves every occurrence standing on its own.
 */
export interface TaskSeries {
  id: string;
  name_template: string;
  interval_weeks: number;
  anchor_date: string;
  until_date: string;
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

// A point-in-time snapshot of a note's document, for restore.
export interface NoteVersion {
  id: string;
  note_id: string;
  content_json: string;
  created_at: string;
}

// A block-based note (Notion-like). content_json is the BlockNote document (an array
// of blocks, serialized). content_text is a derived plaintext flattening of it, kept by
// the repo for search/AI — never authored directly. parent_note_id nests sub-pages.
export interface Note {
  id: string;
  title: string;
  content_json: string;
  content_text: string;
  icon: string | null;
  parent_note_id: string | null;
  /** Optional YYYY-MM-DD; places the note on its class Timeline. Null = a freeform Page. */
  note_date: string | null;
  /** Global pin: 1 surfaces the note in the "Pinned" section. (See note_links.is_pinned for
   *  the separate per-entity pin.) */
  is_pinned: 0 | 1;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// A note plus the id of the course it's filed under (null for a loose note). Used by
// cross-class lists (e.g. the Notes landing page) to color-code a note by its class —
// the color/abbreviation themselves are looked up from the already-loaded course list.
export interface NoteWithCourse extends Note {
  course_id: string | null;
}

// The Studeo entities a note can be attached to. Kept as a fixed set; the DB CHECK
// constraint and the IPC handler both validate against it.
export type NoteLinkEntity =
  | 'course'
  | 'assignment'
  | 'class_meeting'
  | 'study_session'
  | 'term';

export const NOTE_LINK_ENTITIES: NoteLinkEntity[] = [
  'course', 'assignment', 'class_meeting', 'study_session', 'term',
];

export interface NoteLink {
  id: string;
  note_id: string;
  entity_type: NoteLinkEntity;
  entity_id: string;
  /** Only for class_meeting links: the dated lecture (YYYY-MM-DD). Null otherwise. */
  occurrence_date: string | null;
  is_pinned: 0 | 1;
  created_at: string;
}

// A note as seen through one of its links — the note's fields plus the link that attaches
// it to the entity being viewed (so the embed can pin/unpin and order by pin).
export interface EntityNote extends Note {
  link_id: string;
  is_pinned: 0 | 1;
}

export interface StudySession {
  id: string;
  started_at: string;
  duration_seconds: number;
  kind: 'focus' | 'short_break' | 'long_break';
  course_id: string | null;
  /** One-line intention set in Focus Mode before the block started. */
  intention: string | null;
  /** One-line reflection jotted right after the block ended. */
  reflection: string | null;
}

export type StudyBlockStatus = 'planned' | 'done' | 'skipped';

// A planned study session written onto the calendar by exam back-planning.
export interface StudyBlock {
  id: string;
  assignment_id: string | null;
  course_id: string | null;
  title: string;
  scheduled_date: string;        // 'YYYY-MM-DD' (local), all-day
  duration_minutes: number;
  status: StudyBlockStatus;
  created_at: string;
}

// Everything a course owned at the moment it was deleted — enough to put it
// back exactly (same ids everywhere) when the user hits Undo. Returned by
// courses.delete, accepted by courses.restore.
export interface CourseSnapshot {
  course: Course;
  assignments: Assignment[];
  subtasks: Subtask[];
  classMeetings: ClassMeeting[];
  meetingExceptions: MeetingException[];
  studyBlocks: StudyBlock[];
  /** Sessions that pointed at the course. Deleting nulls their course_id
   *  (study history survives the course); restoring re-links them. */
  studySessionIds: string[];
  noteLinks: NoteLink[];
}

/**
 * Everything that dies with a single assignment, captured so Undo can put it back
 * with the SAME ids — which is what makes notes linked to it resolve again.
 *
 * The old Undo re-created the assignment through the normal create path, so it came
 * back with a fresh id and lost its steps, its planned study blocks, its note links,
 * its original created_at and its completed_at. The toast said "Undo", which a user
 * reasonably reads as "put it back". Mirrors CourseSnapshot, which already did this
 * properly.
 */
export interface AssignmentSnapshot {
  assignment: Assignment;
  subtasks: Subtask[];
  studyBlocks: StudyBlock[];
  noteLinks: NoteLink[];
}

// ─── Input types ──────────────────────────────────────────────────────────────
// Separate from the domain models so we never accidentally pass DB row shapes
// as creation inputs (different fields, no id/created_at yet).

/** State of the Apple Reminders mirror, for the Settings row that drives it. */
export interface AppleRemindersStatus {
  /** macOS only — Reminders is scripted through AppleScript. */
  supported: boolean;
  enabled: boolean;
  syncing: boolean;
  /** ISO/UTC timestamp of the last completed pass, or null if it hasn't run. */
  lastSyncAt: string | null;
  /** Human-readable reason the last pass didn't fully succeed, or null. */
  lastError: string | null;
  /** How many assignments currently have a reminder mirroring them. */
  mirrored: number;
  /** Opt-in: delete a mirrored reminder when its assignment is completed, rather
   *  than ticking it off and leaving it in the list. See CompletedAction in
   *  shared/appleReminderSync.ts for why both behaviours are reasonable. */
  removeCompleted: boolean;
  /** The Reminders list Studeo owns. Fixed, so the sync can never manage a list
   *  the user filled with their own items. */
  listName: string;
}

export interface ReminderConfig {
  enabled: boolean;
  /** Minutes before a class meeting's start time to fire the notification. */
  leadMinutes: number;
  /** Daily due-date digest: one notification listing what's due today & tomorrow. */
  dueDigestEnabled: boolean;
  /** Local time ("HH:MM", 24h) at which the daily due digest fires. */
  dueDigestTime: string;
}

/**
 * Where a clicked desktop reminder should take the user. Main builds this when a
 * notification fires and pushes it to the renderer on click; the renderer maps it
 * to a route. A discriminated union so adding a new destination is type-checked
 * end to end (main must set `view`, the renderer must handle it).
 */
export type ReminderNavTarget =
  | { view: 'course'; courseId: string } // class reminder → that course's page
  | { view: 'this-week' };               // due digest → the This Week list

export interface CreateStudySessionInput {
  startedAt: string;        // ISO timestamp (UTC) — when the session began
  durationSeconds: number;
  kind: 'focus' | 'short_break' | 'long_break';
  courseId?: string;
  intention?: string;
}

export interface UpdateStudySessionInput {
  reflection?: string | null;
  intention?: string | null;
}

export interface CreateStudyBlockInput {
  assignmentId?: string | null;
  courseId?: string | null;
  title: string;
  scheduledDate: string;         // 'YYYY-MM-DD'
  durationMinutes: number;
}

export interface UpdateStudyBlockInput {
  status?: StudyBlockStatus;
  scheduledDate?: string;
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
  /** Custom grade sections (name + weight + score); null clears the scheme. */
  gradeSections?: GradeSection[] | null;
}

export interface CreateAssignmentInput {
  courseId: string;
  name: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  dueDate: string;
  /** Optional "HH:MM" (24h) time of day; omit/null for an all-day due date. */
  dueTime?: string | null;
  notes?: string;
  score?: number | null;
  pointsPossible?: number | null;
  /** Set only by createAssignmentSeries when it expands a rule into rows.
   *  Nothing in the UI passes these directly. */
  seriesId?: string | null;
  seriesIndex?: number | null;
}

export interface UpdateAssignmentInput {
  name?: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  dueDate?: string;
  /** "HH:MM" (24h) to set a time, or null to clear it back to all-day. */
  dueTime?: string | null;
  notes?: string | null;
  score?: number | null;
  pointsPossible?: number | null;
}

export interface CreateAssignmentSeriesInput {
  courseId: string;
  /** The first occurrence's name, as typed. Later ones are numbered from it. */
  name: string;
  type?: AssignmentType;
  anchorDate: string; // first occurrence, YYYY-MM-DD
  untilDate: string;  // inclusive end of the series
  intervalWeeks: number;
  /** "HH:MM" (24h) applied to every occurrence; omit/null for all-day. */
  dueTime?: string | null;
}

/** A series plus the rows it just created — what the UI needs to show the result. */
export interface AssignmentSeriesWithOccurrences {
  series: AssignmentSeries;
  assignments: Assignment[];
}

export interface SeriesOccurrenceInput {
  name: string;
  type?: AssignmentType;
  dueDate: string;
  dueTime?: string | null;
}

/**
 * A series built from occurrences that already exist on screen, rather than from
 * a rule to expand.
 *
 * Day-One Setup's grid fills itself with the repeats up front so they can be
 * edited before saving — renamed, re-dated, deleted, interleaved with other
 * rows. By the time Save runs, the rows ARE the series, so re-deriving them from
 * a rule would throw away whatever the user changed. The rule fields are read
 * back off the occurrences instead.
 */
export interface CreateAssignmentSeriesFromRowsInput {
  courseId: string;
  intervalWeeks: number;
  /** In series order — position here becomes series_index. At least two. */
  occurrences: SeriesOccurrenceInput[];
}

/**
 * One grid's worth of saving: its repeating groups and its one-off rows, written
 * together or not at all. Day-One Setup has always promised that a failed save
 * leaves nothing behind, and splitting series and singles across two calls would
 * quietly break that.
 */
export interface CreateAssignmentBatchInput {
  series: CreateAssignmentSeriesFromRowsInput[];
  singles: CreateAssignmentInput[];
}

export interface AssignmentBatchResult {
  series: AssignmentSeries[];
  assignments: Assignment[];
}

/**
 * Link assignments that already exist into a series they were always meant to
 * be — the escape hatch for everything added before series existed, and for
 * anything an importer creates as unrelated rows.
 *
 * Purely additive: it stamps the rows with a series and writes the rule, and
 * changes nothing else. Names are left exactly as they are, because linking is
 * a statement about what these rows ARE, not a request to rewrite them. A
 * scoped rename afterwards is a separate decision.
 */
/**
 * Why an occurrence survived a "stop repeating from here".
 *
 * The cut only removes placeholders. Anything with work in it is kept and named
 * back to the user, because the one thing this action must never do is quietly
 * delete something they'd started.
 */
export type KeptReason = 'completed' | 'graded' | 'in_progress' | 'has_work';

export interface StopRepeatingInput {
  /** Cut from this occurrence: it and everything after it are considered. */
  assignmentId: string;
}

export interface StopRepeatingResult {
  seriesId: string;
  /** Full snapshots of what was removed, so Undo can put it back under the same ids. */
  removed: AssignmentSnapshot[];
  /** Occurrences the cut deliberately spared, and why. */
  kept: { id: string; name: string; reason: KeptReason }[];
  /** The series' end date before the cut; Undo restores it with the rows. */
  previousUntilDate: string;
}

export interface RestoreOccurrencesInput {
  seriesId: string;
  untilDate: string;
  snapshots: AssignmentSnapshot[];
}

export interface LinkIntoSeriesInput {
  courseId: string;
  intervalWeeks: number;
  /** Existing, unlinked ids in the order they should be numbered. */
  assignmentIds: string[];
}

export interface ExtendAssignmentSeriesInput {
  seriesId: string;
  /** New inclusive end date; must be after the current one. */
  untilDate: string;
}

export interface ShiftAssignmentsInput {
  /** The occurrence the user acted on — the anchor for 'one' and 'this_and_later'. */
  assignmentId: string;
  scope: SeriesScope;
  /** Whole days to add; negative pulls the dates earlier. */
  days: number;
}

/** One row's due date before and after a move. The list of these IS the Undo.
 *  Shared by assignments and tasks — a date moves the same way for both. */
export interface DateChange {
  id: string;
  from: string;
  to: string;
}

/** {id, dueDate} pairs for a transactional multi-row date write. */
export interface DateSet {
  id: string;
  dueDate: string;
}

/**
 * A scoped edit to the fields that aren't dates: the name, and (assignments
 * only) the time of day. Separate from a shift because the rules differ — a
 * rename renumbers itself across the series, and finished occurrences are NOT
 * protected from it. A past due date is a fact about when something was due; a
 * name is only a label, and when a course renames "Problem Set" to "Homework"
 * the rows you already handed in should say so too.
 */
export interface ApplyToSeriesInput {
  /** The occurrence the user edited — anchors both the scope and the numbering. */
  assignmentId: string;
  scope: SeriesScope;
  /** New name as typed on the anchor; other occurrences are renumbered from it. */
  name?: string;
  /** "HH:MM" to set, null to clear back to all-day. Omit to leave times alone. */
  dueTime?: string | null;
}

/** One row's name and time before and after a scoped edit. The list is the Undo. */
export interface FieldChange {
  id: string;
  fromName: string;
  toName: string;
  fromDueTime: string | null;
  toDueTime: string | null;
}

export interface ApplySeriesResult {
  changed: FieldChange[];
}

/** {id, name, dueTime} for a transactional multi-row field write. */
export interface FieldSet {
  id: string;
  name: string;
  dueTime: string | null;
}

/** The task equivalents. Tasks have no time of day, so a scoped edit to one is
 *  only ever a rename — and the types say so rather than carrying a dead field. */
/**
 * Why a task occurrence survived a "stop repeating from here".
 *
 * Narrower than the assignment version on purpose: a task has no grade, and
 * nothing in the schema hangs off one — no steps, no planned study blocks, no
 * linked notes — so the only evidence that somebody has engaged with it is its
 * own status.
 */
export type TaskKeptReason = 'completed' | 'in_progress';

export interface StopRepeatingTasksInput {
  /** Cut from this occurrence: it and everything after it are considered. */
  taskId: string;
}

export interface StopRepeatingTasksResult {
  seriesId: string;
  /** The removed rows, which for a task is the whole snapshot — nothing hangs
   *  off one, so the row IS everything Undo needs. */
  removed: Task[];
  kept: { id: string; name: string; reason: TaskKeptReason }[];
  previousUntilDate: string;
}

export interface RestoreTaskOccurrencesInput {
  seriesId: string;
  untilDate: string;
  tasks: Task[];
}

export interface ApplyToTaskSeriesInput {
  taskId: string;
  scope: SeriesScope;
  name: string;
}

export interface NameChange {
  id: string;
  from: string;
  to: string;
}

export interface ApplyTaskSeriesResult {
  changed: NameChange[];
}

export interface NameSet {
  id: string;
  name: string;
}

/**
 * Put a run back on a rhythm.
 *
 * The repair for a series that was pushed back one occurrence at a time until
 * several of them landed in the same week. Always means "this one and the ones
 * after it": the anchor keeps its date and the rest are laid out from it, so
 * nothing before the row you pointed at ever moves. Re-spacing a whole series
 * is the same action started from its first occurrence.
 */
export interface RespaceSeriesInput {
  assignmentId: string;
  /** 1 = one a week, 2 = every two weeks. */
  intervalWeeks: number;
}

export interface RespaceTasksInput {
  taskId: string;
  intervalWeeks: number;
}

export interface ShiftResult {
  changed: DateChange[];
  /** Occurrences deliberately left alone, so the UI can say "moved 7, left 2
   *  already-graded ones alone" instead of quietly rewriting finished history. */
  skipped: { id: string; name: string; reason: 'completed' | 'graded' }[];
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
  /** Set by createTaskSeries when it expands a rule into rows — and by Undo,
   *  so taking back a deleted occurrence puts it back in its series. */
  seriesId?: string | null;
  seriesIndex?: number | null;
}

export interface CreateTaskSeriesInput {
  /** The first occurrence's name, as typed. Later ones are numbered from it. */
  name: string;
  anchorDate: string;
  untilDate: string;
  intervalWeeks: number;
}

export interface TaskSeriesWithOccurrences {
  series: TaskSeries;
  tasks: Task[];
}

export interface ExtendTaskSeriesInput {
  seriesId: string;
  untilDate: string;
}

export interface ShiftTasksInput {
  taskId: string;
  scope: SeriesScope;
  /** Whole days to add; negative pulls the dates earlier. */
  days: number;
}

export interface UpdateTaskInput {
  name?: string;
  status?: AssignmentStatus;
  dueDate?: string;
}

export interface CreateNoteInput {
  title?: string;
  /** BlockNote document, serialized. Defaults to an empty document ('[]'). */
  contentJson?: string;
  icon?: string;
  parentNoteId?: string;
  /** YYYY-MM-DD; places the note on a class Timeline. */
  noteDate?: string;
}

export interface UpdateNoteInput {
  title?: string;
  /** When provided, the repo recomputes content_text from it. */
  contentJson?: string;
  icon?: string | null;
  parentNoteId?: string | null;
  /** YYYY-MM-DD to place on the Timeline, or null to move it back to Pages. */
  noteDate?: string | null;
  /** true = pin globally (Pinned section); false = unpin. */
  pinned?: boolean;
  /** true = move to trash (sets archived_at); false = restore (clears it). */
  archived?: boolean;
}

export interface CreateNoteLinkInput {
  noteId: string;
  entityType: NoteLinkEntity;
  entityId: string;
  /** Only for class_meeting: pins the note to one dated lecture (YYYY-MM-DD). */
  occurrenceDate?: string;
}

export interface SaveMediaInput {
  /** The note the image belongs to — its bytes are stored under this note's folder. */
  noteId: string;
  /** File extension (no dot), e.g. "png". Validated against an image whitelist in main. */
  ext: string;
  data: Uint8Array;
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

export interface AppleMusicStatus {
  /** Is a controllable Apple Music session available right now? */
  running: boolean;
  /** macOS Automation permission granted (always true on Windows — SMTC needs no grant). */
  authorized: boolean;
  /** macOS can list playlists & search the library; Windows (SMTC) can only show now-playing. */
  canBrowseLibrary: boolean;
}

// ─── IPC channel names ────────────────────────────────────────────────────────
// Defined once as constants so main/preload/renderer all use the exact same
// string — a typo anywhere would be a compile error instead of a silent bug.

/** What one manual "check for updates" round trip found.
 *  - `unsupported`  — a dev build: not packaged or signed, so the OS updater can't run.
 *  - `up-to-date`   — the service has no release newer than this build.
 *  - `downloading`  — a newer release exists and is downloading in the background;
 *                     the app offers to restart once it's ready.
 *  - `downloaded`   — a build is already staged, waiting for a restart.
 *  - `error`        — the check couldn't be completed. */
export type UpdateCheckResult =
  | { status: 'unsupported' }
  | { status: 'up-to-date' }
  | { status: 'downloading' }
  | { status: 'downloaded'; version?: string }
  | { status: 'error'; message: string };

export const IPC = {
  COURSES: {
    LIST:    'courses:list',
    GET:     'courses:get',
    CREATE:  'courses:create',
    UPDATE:  'courses:update',
    DELETE:  'courses:delete',
    RESTORE: 'courses:restore',
  },
  ASSIGNMENTS: {
    LIST:        'assignments:list',
    CREATE:      'assignments:create',
    CREATE_MANY: 'assignments:create-many',
    UPDATE:      'assignments:update',
    DELETE:      'assignments:delete',
    RESTORE:     'assignments:restore',
    SHIFT:       'assignments:shift',
    RESPACE:     'assignments:respace',
    SET_DATES:   'assignments:set-dates',
    CREATE_BATCH:'assignments:create-batch',
    APPLY_SERIES:'assignments:apply-series',
    SET_FIELDS:  'assignments:set-fields',
  },
  ASSIGNMENT_SERIES: {
    LIST:   'assignment_series:list',
    CREATE: 'assignment_series:create',
    LINK:   'assignment_series:link',
    STOP_FROM: 'assignment_series:stop-from',
    RESTORE_OCCURRENCES: 'assignment_series:restore-occurrences',
    EXTEND: 'assignment_series:extend',
    DELETE: 'assignment_series:delete',
  },
  SUBTASKS: {
    LIST:   'subtasks:list',
    CREATE: 'subtasks:create',
    UPDATE: 'subtasks:update',
    DELETE: 'subtasks:delete',
  },
  TASKS: {
    LIST:        'tasks:list',
    CREATE:      'tasks:create',
    CREATE_MANY: 'tasks:create-many',
    UPDATE:      'tasks:update',
    DELETE:      'tasks:delete',
    SHIFT:       'tasks:shift',
    RESPACE:     'tasks:respace',
    SET_DATES:   'tasks:set-dates',
    APPLY_SERIES:'tasks:apply-series',
    SET_NAMES:   'tasks:set-names',
  },
  TASK_SERIES: {
    LIST:   'task_series:list',
    CREATE: 'task_series:create',
    STOP_FROM: 'task_series:stop-from',
    RESTORE_OCCURRENCES: 'task_series:restore-occurrences',
    EXTEND: 'task_series:extend',
    DELETE: 'task_series:delete',
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
    UPDATE: 'study_sessions:update',
    DELETE: 'study_sessions:delete',
    RESTORE: 'study_sessions:restore',
  },
  STUDY_BLOCKS: {
    LIST:        'study_blocks:list',
    CREATE_MANY: 'study_blocks:create-many',
    UPDATE:      'study_blocks:update',
    DELETE:      'study_blocks:delete',
    DELETE_FOR_ASSIGNMENT: 'study_blocks:delete-for-assignment',
  },
  NOTES: {
    LIST:            'notes:list',
    LIST_WITH_COURSE:'notes:list-with-course',
    LIST_LOOSE:      'notes:list-loose',
    CHILDREN:        'notes:children',
    GET:             'notes:get',
    SEARCH:          'notes:search',
    CREATE:          'notes:create',
    UPDATE:          'notes:update',
    DELETE:          'notes:delete',
    LIST_VERSIONS:   'notes:list-versions',
    RESTORE_VERSION: 'notes:restore-version',
  },
  NOTE_LINKS: {
    LIST_FOR_NOTE:    'note_links:list-for-note',
    NOTES_FOR_ENTITY: 'note_links:notes-for-entity',
    CREATE:           'note_links:create',
    SET_PINNED:       'note_links:set-pinned',
    DELETE:           'note_links:delete',
  },
  MEDIA: {
    SAVE: 'media:save',
  },
  REMINDERS: {
    CONFIGURE: 'reminders:configure',
    TEST:      'reminders:test',
    // main → renderer push: deep-link target when a reminder is clicked.
    NAVIGATE:  'reminders:navigate',
  },
  APP: {
    REVEAL_DATA:    'app:reveal-data',
    BACKUP_DATA:    'app:backup-data',
    RESTORE_DATA:   'app:restore-data',
    LIST_BACKUPS:   'app:list-backups',
    REVEAL_BACKUPS: 'app:reveal-backups',
    GET_LOGIN_ITEM: 'app:get-login-item',
    SET_LOGIN_ITEM: 'app:set-login-item',
    GET_SETTINGS:   'app:get-settings',
    SET_SETTING:    'app:set-setting',
    SET_FULLSCREEN: 'app:set-fullscreen',
    GET_FULLSCREEN: 'app:get-fullscreen',
    CHECK_UPDATES:  'app:check-updates',
    SWEEP_ASSETS:   'app:sweep-assets',
  },
  APPLE_REMINDERS: {
    STATUS:               'apple_reminders:status',
    SET_ENABLED:          'apple_reminders:set-enabled',
    SET_REMOVE_COMPLETED: 'apple_reminders:set-remove-completed',
    SYNC_NOW:             'apple_reminders:sync-now',
    REBUILD:              'apple_reminders:rebuild',
  },
  FEEDS: {
    FETCH_ICS: 'feeds:fetch-ics',
  },
  PDF: {
    PICK: 'pdf:pick',
  },
  // The floating Pomodoro pop-out. OPEN/CLOSE/TOGGLE/IS_OPEN and SHOW_MAIN are window
  // management (renderer → main). The other three are the state relay: the owner window
  // PUBLISHes snapshots, main pushes them to the pop-out as STATE (and answers GET_STATE
  // for a pop-out that just mounted), and the pop-out's buttons travel back as COMMANDs.
  MINI_TIMER: {
    OPEN:         'mini_timer:open',
    CLOSE:        'mini_timer:close',
    TOGGLE:       'mini_timer:toggle',
    IS_OPEN:      'mini_timer:is-open',
    OPEN_CHANGED: 'mini_timer:open-changed',
    SHOW_MAIN:    'mini_timer:show-main',
    PUBLISH:      'mini_timer:publish',
    GET_STATE:    'mini_timer:get-state',
    STATE:        'mini_timer:state',
    COMMAND:      'mini_timer:command',
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
    QUEUE:            'spotify:queue',
    VOLUME:           'spotify:volume',
    USER_PLAYLISTS:   'spotify:user-playlists',
    SEARCH_PLAYLISTS: 'spotify:search-playlists',
  },
} as const;

/**
 * Result of picking a PDF. Main hands back raw BYTES, never an interpretation of them:
 * every PDF feature parses in the renderer, which has a canvas for rasterizing pages and
 * is sandboxed for reading a document nobody here wrote. Main does only the part that
 * requires it — touching the filesystem.
 */
export type PickPdfResult =
  | { canceled: true }
  | { canceled: false; data: Uint8Array; fileName: string };

// ─── window.api contract ──────────────────────────────────────────────────────
// This interface is implemented by preload.ts and consumed by the renderer.
// Keeping it in shared/ means both sides are typed against the same shape.

export interface WindowApi {
  courses: {
    list(): Promise<Course[]>;
    get(id: string): Promise<Course | null>;
    create(input: CreateCourseInput): Promise<Course>;
    update(id: string, input: UpdateCourseInput): Promise<Course>;
    /** Deletes the course and everything it owns; returns a snapshot for Undo
     *  (null when the id didn't exist, so there's nothing to take back). */
    delete(id: string): Promise<CourseSnapshot | null>;
    /** Puts a deleted course back exactly as it was (the Undo action). */
    restore(snapshot: CourseSnapshot): Promise<Course>;
  };
  assignments: {
    list(filters?: { courseId?: string; status?: AssignmentStatus }): Promise<Assignment[]>;
    create(input: CreateAssignmentInput): Promise<Assignment>;
    /** Atomic batch insert — all rows save or none do (Day-One Setup). */
    createMany(inputs: CreateAssignmentInput[]): Promise<Assignment[]>;
    update(id: string, input: UpdateAssignmentInput): Promise<Assignment>;
    /** Returns everything it removed, so Undo can restore it exactly. Null if the id was already gone. */
    delete(id: string): Promise<AssignmentSnapshot | null>;
    restore(snapshot: AssignmentSnapshot): Promise<Assignment>;
    /** Move one occurrence, or it and the rest of its series, by a number of days.
     *  Completed and graded occurrences are skipped and reported back. */
    shift(input: ShiftAssignmentsInput): Promise<ShiftResult>;
    /** Lay this occurrence and the ones after it back out at a fixed interval. */
    respace(input: RespaceSeriesInput): Promise<ShiftResult>;
    /** Transactional multi-row date write — all rows land or none do. Also how
     *  Undo replays a shift, by passing each row's original date back. */
    setDates(items: DateSet[]): Promise<number>;
    /** Save a whole grid — repeating groups and one-off rows — in one transaction. */
    createBatch(input: CreateAssignmentBatchInput): Promise<AssignmentBatchResult>;
    /** Apply a rename and/or a due time across a series. Occurrences are
     *  renumbered from the anchor's new name; finished ones are included. */
    applyToSeries(input: ApplyToSeriesInput): Promise<ApplySeriesResult>;
    /** Transactional multi-row name/time write — how Undo replays the above. */
    setFields(items: FieldSet[]): Promise<number>;
  };
  assignmentSeries: {
    list(filters?: { courseId?: string }): Promise<AssignmentSeries[]>;
    /** Creates the series and expands it into occurrences in one transaction. */
    create(input: CreateAssignmentSeriesInput): Promise<AssignmentSeriesWithOccurrences>;
    /** Push the end date out and append the occurrences that fit ("prof added two more"). */
    extend(input: ExtendAssignmentSeriesInput): Promise<AssignmentSeriesWithOccurrences>;
    /** Bind existing unlinked rows into a series, leaving their names alone. */
    link(input: LinkIntoSeriesInput): Promise<AssignmentSeriesWithOccurrences>;
    /** Drop this occurrence and the later ones that are still untouched, and pull
     *  the series' end date back. Anything with work in it is kept and reported. */
    stopFrom(input: StopRepeatingInput): Promise<StopRepeatingResult>;
    /** The Undo: puts the removed occurrences back and restores the end date. */
    restoreOccurrences(input: RestoreOccurrencesInput): Promise<void>;
    /** "Stop repeating": drops the rule only. Every occurrence survives as a
     *  standalone assignment, grades and all. */
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
    /** Atomic batch insert — all rows save or none do (recurring task series). */
    createMany(inputs: CreateTaskInput[]): Promise<Task[]>;
    update(id: string, input: UpdateTaskInput): Promise<Task>;
    delete(id: string): Promise<void>;
    /** Move one occurrence, or it and the rest of its series, by a number of days.
     *  Completed occurrences are skipped and reported back. */
    shift(input: ShiftTasksInput): Promise<ShiftResult>;
    /** Lay this occurrence and the ones after it back out at a fixed interval. */
    respace(input: RespaceTasksInput): Promise<ShiftResult>;
    /** Transactional multi-row date write — also how Undo replays a shift. */
    setDates(items: DateSet[]): Promise<number>;
    /** Apply a rename across a series, renumbering from the anchor's new name. */
    applyToSeries(input: ApplyToTaskSeriesInput): Promise<ApplyTaskSeriesResult>;
    /** Transactional multi-row name write — how Undo replays the above. */
    setNames(items: NameSet[]): Promise<number>;
  };
  taskSeries: {
    list(): Promise<TaskSeries[]>;
    /** Creates the series and expands it into occurrences in one transaction. */
    create(input: CreateTaskSeriesInput): Promise<TaskSeriesWithOccurrences>;
    extend(input: ExtendTaskSeriesInput): Promise<TaskSeriesWithOccurrences>;
    /** Drop this occurrence and the later untouched ones, pulling the end date back. */
    stopFrom(input: StopRepeatingTasksInput): Promise<StopRepeatingTasksResult>;
    /** The Undo: puts the removed occurrences back and restores the end date. */
    restoreOccurrences(input: RestoreTaskOccurrencesInput): Promise<void>;
    /** "Stop repeating": drops the rule only; every occurrence survives. */
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
    /** Attach an intention/reflection to an already-logged session. */
    update(id: string, input: UpdateStudySessionInput): Promise<StudySession>;
    /** Remove a mis-logged session. Returns the row so Undo can put it back. */
    delete(id: string): Promise<StudySession | null>;
    restore(session: StudySession): Promise<StudySession>;
  };
  studyBlocks: {
    list(): Promise<StudyBlock[]>;
    /** Atomic batch insert of a generated study plan — all rows save or none do. */
    createMany(inputs: CreateStudyBlockInput[]): Promise<StudyBlock[]>;
    update(id: string, input: UpdateStudyBlockInput): Promise<StudyBlock>;
    delete(id: string): Promise<void>;
    /** Clear an exam's existing plan before regenerating it (the "Replace" flow). */
    deleteForAssignment(assignmentId: string): Promise<void>;
  };
  notes: {
    /** Defaults to non-archived notes; pass { archived: true } for the trash. */
    list(filters?: { archived?: boolean }): Promise<Note[]>;
    /** Non-archived notes, newest first, each tagged with its course id (null = loose). */
    listWithCourse(): Promise<NoteWithCourse[]>;
    /** Top-level notes not attached to any course (the "Loose notes" bucket). */
    listLoose(): Promise<Note[]>;
    /** Direct sub-pages of a note (the Pages tree). */
    children(parentId: string): Promise<Note[]>;
    get(id: string): Promise<Note | null>;
    /** Full-text search over title + content_text (non-archived only). */
    search(query: string): Promise<Note[]>;
    create(input: CreateNoteInput): Promise<Note>;
    update(id: string, input: UpdateNoteInput): Promise<Note>;
    delete(id: string): Promise<void>;
    /** Recent saved snapshots of a note's document, newest first. */
    listVersions(noteId: string): Promise<NoteVersion[]>;
    /** Restore a note to a snapshot (snapshots the current content first so it's reversible). */
    restoreVersion(noteId: string, versionId: string): Promise<Note>;
  };
  noteLinks: {
    /** The links attached to one note (for the editor's link bar). */
    listForNote(noteId: string): Promise<NoteLink[]>;
    /** The notes attached to one entity (for per-entity embeds), pinned first. occurrenceDate
        scopes to a single dated lecture for class_meeting links. */
    notesForEntity(entityType: NoteLinkEntity, entityId: string, occurrenceDate?: string): Promise<EntityNote[]>;
    /** Linking the same note+entity twice is a no-op and returns the existing link. */
    create(input: CreateNoteLinkInput): Promise<NoteLink>;
    /** Pin/unpin a note on an entity (e.g. a course "home" page). Keyed by the link id. */
    setPinned(linkId: string, pinned: boolean): Promise<void>;
    delete(id: string): Promise<void>;
  };
  media: {
    /** Persist image bytes for a note; resolves to a studeo-asset:// URL to render it. */
    save(input: SaveMediaInput): Promise<string>;
  };
  reminders: {
    configure(config: ReminderConfig): Promise<void>;
    /** Fire a sample desktop notification so the user can verify permissions. */
    /** `shown` is false when the OS suppressed it — notifications off, or Focus on. */
    test(): Promise<{ supported: boolean; shown: boolean }>;
    /** Subscribe to deep-link requests pushed from main when a reminder is
     *  clicked. Returns an unsubscribe function. */
    onNavigate(cb: (target: ReminderNavTarget) => void): () => void;
  };
  app: {
    /** Highlight the database file in Finder / Explorer. */
    revealData(): Promise<void>;
    /** Ask the update service now instead of waiting for the hourly check. */
    checkForUpdates(): Promise<UpdateCheckResult>;
    /** Save-dialog + consistent snapshot of the database. saved=false means canceled. */
    backupData(): Promise<{ saved: boolean; path?: string; error?: string }>;
    /** Open-dialog + validate + (after a safety snapshot of current data) replace the live
     *  database with a chosen backup, then relaunch. On success the app restarts, so the
     *  promise only resolves with restored=false (canceled or error). */
    restoreData(): Promise<{ restored: boolean; canceled?: boolean; error?: string }>;
    /** How many automatic snapshots are on disk, and the local day (YYYY-MM-DD) of the
     *  newest — so Settings can show that the rolling backups are actually running. */
    /** Reclaim note images nothing references any more. Returns what was freed. */
    sweepAssets(): Promise<{ removed: number; bytes: number }>;
    listBackups(): Promise<{ count: number; newestDay: string | null }>;
    /** Open the automatic-backups folder in Finder / Explorer. */
    revealBackups(): Promise<void>;
    /** Whether Studeo starts at login, read from the OS (which can change it behind our
     *  back). `supported` is false in dev and on Linux, where we can't register it. */
    getLoginItem(): Promise<{ supported: boolean; openAtLogin: boolean }>;
    /** Turn the login item on/off; resolves with the state the OS actually ended up in. */
    setLoginItem(enabled: boolean): Promise<{ supported: boolean; openAtLogin: boolean }>;
    /** All saved UI preferences, read synchronously at preload time so they can be applied
     *  before first paint (e.g. theme, with no flash). Keys absent until first set. */
    initialSettings: Record<string, string>;
    /** Persist a UI preference in the main process so it survives a full quit/relaunch. */
    setSetting(key: string, value: string): Promise<void>;
    /** Put the window into (or out of) true OS fullscreen — no title bar/chrome.
     *  Used by Focus Mode for an immersive, distraction-free environment. */
    setFullscreen(on: boolean): Promise<void>;
    /** Whether the window is currently in OS fullscreen. */
    isFullscreen(): Promise<boolean>;
    /** Subscribe to fullscreen changes (covers the OS exit gestures: Esc, green button,
     *  Ctrl+Cmd+F), so the UI stays in sync. Returns a cleanup function. */
    onFullscreenChange(cb: (isFullscreen: boolean) => void): () => void;
  };
  /**
   * The floating Pomodoro pop-out: a small always-on-top window that shows the running
   * timer wherever you are, with play/pause and skip on it.
   *
   * The timer itself is NOT duplicated there. The main window owns the store and stays
   * the single source of truth; this API is the relay in both directions. Which half a
   * method belongs to is worth knowing when reading it:
   *   - open/close/toggle/isOpen/onOpenChanged — called by the MAIN window (the UI button)
   *   - publish/onCommand                      — the MAIN window as state owner
   *   - getState/onState/command/closeSelf/showMain — called by the POP-OUT
   */
  miniTimer: {
    open(): Promise<void>;
    close(): Promise<void>;
    /** Open it if closed, close it if open. Resolves with the state it ended up in. */
    toggle(): Promise<boolean>;
    isOpen(): Promise<boolean>;
    /** Keeps the main window's "Pop out" button honest when the pop-out is closed
     *  from its own × (or by the app). Returns a cleanup function. */
    onOpenChanged(cb: (isOpen: boolean) => void): () => void;

    /** Owner → main: the latest timer snapshot, forwarded to the pop-out if it's open
     *  and cached for one that opens later. */
    publish(state: MiniTimerState): void;
    /** Owner: run the pop-out's button presses against the real store. Cleanup fn. */
    onCommand(cb: (command: MiniTimerCommand) => void): () => void;

    /** Pop-out: the cached snapshot, for the first paint. Null before the owner has
     *  published anything (only possible if the owner window is gone). */
    getState(): Promise<MiniTimerState | null>;
    /** Pop-out: subscribe to snapshots. Returns a cleanup function. */
    onState(cb: (state: MiniTimerState) => void): () => void;
    /** Pop-out: ask the owner window to start / pause / skip. */
    command(command: MiniTimerCommand): void;
    /** Pop-out: close myself (the × on the pill). */
    closeSelf(): Promise<void>;
    /** Pop-out: bring the main Studeo window forward (double-click the pill). */
    showMain(): Promise<void>;
  };
  feeds: {
    /** Fetch a remote .ics calendar feed by URL (done in main; returns raw text). */
    fetchIcs(url: string): Promise<{ text: string }>;
  };
  pdf: {
    /** Open-dialog + read a PDF, returning its raw bytes for the renderer to
     *  rasterize or extract text from. `title` labels the file dialog. Rejects if
     *  the file is unreadable or over the size ceiling. */
    pick(title?: string): Promise<PickPdfResult>;
  };
  /** Mirrors upcoming assignments into an Apple Reminders list, which iCloud carries
   *  to the phone — the only path that alerts you with the laptop shut. */
  appleReminders: {
    status():                        Promise<AppleRemindersStatus>;
    setEnabled(enabled: boolean):    Promise<AppleRemindersStatus>;
    /** Delete the mirrored reminder on completion instead of ticking it off. */
    setRemoveCompleted(remove: boolean): Promise<AppleRemindersStatus>;
    /** Force a pass now instead of waiting for the interval. */
    syncNow():                       Promise<AppleRemindersStatus>;
    /** Delete the mirrored list and forget every link, so the next sync rebuilds
     *  it. The repair for a list that already accumulated duplicates. */
    rebuild():                       Promise<AppleRemindersStatus>;
  };
  appleMusic: {
    status():                        Promise<AppleMusicStatus>;
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
    /** `ok:false` with a reason when this system has no secure store for the token. */
    connect(clientId: string): Promise<{ ok: boolean; error?: string }>;
    disconnect(): Promise<{ ok: boolean }>;
    playback(): Promise<SpotifyPlaybackState | null>;
    play(contextUri?: string): Promise<{ ok: boolean; error?: string }>;
    pause(): Promise<{ ok: boolean; error?: string }>;
    next(): Promise<{ ok: boolean; error?: string }>;
    previous(): Promise<{ ok: boolean; error?: string }>;
    /** Upcoming tracks (the "Up next" queue). Empty when unavailable. */
    queue(): Promise<SpotifyTrack[]>;
    volume(percent: number): Promise<{ ok: boolean; error?: string }>;
    userPlaylists(): Promise<SpotifyPlaylist[]>;
    searchPlaylists(query: string): Promise<SpotifyPlaylist[]>;
    onAuthCallback(cb: (success: boolean) => void): () => void;
  };
}
