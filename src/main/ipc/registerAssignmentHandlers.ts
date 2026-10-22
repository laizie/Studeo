import { ipcMain } from 'electron';
import { IPC, ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES, SERIES_SCOPES } from '../../shared/types';
import type {
  ApplyToSeriesInput,
  DateSet,
  FieldSet,
  CreateAssignmentBatchInput,
  AssignmentSnapshot,
  AssignmentStatus,
  CreateAssignmentInput,
  ShiftAssignmentsInput,
  UpdateAssignmentInput,
} from '../../shared/types';
import { assertIsoDate, assertOneOf, assertOptionalOneOf } from '../../shared/validate';
import {
  listAssignments,
  createAssignment,
  createAssignments,
  updateAssignment,
  deleteAssignment,
  restoreAssignment,
  shiftAssignments,
  setDates,
  applyToSeries,
  setFields,
} from '../db/repositories/assignmentRepo';
import { createAssignmentBatch } from '../db/repositories/assignmentSeriesRepo';
import { notifyAssignmentsChanged } from '../applereminders';

// score/pointsPossible: absent or null = "no grade recorded"; otherwise both
// must be sane non-negative numbers and you can't earn points out of nothing.
function validateGradeFields(input: { score?: number | null; pointsPossible?: number | null }): void {
  if (input.score != null && (!Number.isFinite(input.score) || input.score < 0)) {
    throw new Error('score must be a non-negative number');
  }
  if (input.pointsPossible != null && (!Number.isFinite(input.pointsPossible) || input.pointsPossible <= 0)) {
    throw new Error('pointsPossible must be a positive number');
  }
}

// dueTime: absent or null = all-day; otherwise a strict "HH:MM" 24h clock time.
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function validateDueTime(input: { dueTime?: string | null }): void {
  if (input.dueTime != null && !HHMM_RE.test(input.dueTime)) {
    throw new Error('dueTime must be "HH:MM" (24-hour), or null for all-day');
  }
}

// type/status are fixed enums the whole UI branches on, but they were being written
// straight to SQL unchecked (and the columns carry no CHECK constraint either). The
// dropdowns only ever produce valid values — that's exactly the assumption main isn't
// allowed to make. The ICS importer and syllabus parser are the realistic ways a
// surprise value gets in.
function validateEnums(input: { type?: unknown; status?: unknown }): void {
  assertOptionalOneOf(input.type, ASSIGNMENT_TYPES, 'type');
  assertOptionalOneOf(input.status, ASSIGNMENT_STATUSES, 'status');
}

export function registerAssignmentHandlers(): void {
  ipcMain.handle(
    IPC.ASSIGNMENTS.LIST,
    (_event, filters?: { courseId?: string; status?: AssignmentStatus }) =>
      listAssignments(filters ?? {})
  );

  ipcMain.handle(IPC.ASSIGNMENTS.CREATE, (_event, input: CreateAssignmentInput) => {
    if (!input.courseId)      throw new Error('courseId is required');
    if (!input.name?.trim())  throw new Error('Assignment name is required');
    if (!input.dueDate)       throw new Error('dueDate is required');
    validateGradeFields(input);
    validateDueTime(input);
    validateEnums(input);
    const created = createAssignment(input);
    // The mirror otherwise moved only on a five-minute poll, so something you
    // just added could take that long to reach your phone. The notifier
    // debounces, so a burst of these still costs one pass.
    notifyAssignmentsChanged();
    return created;
  });

  ipcMain.handle(IPC.ASSIGNMENTS.CREATE_MANY, (_event, inputs: CreateAssignmentInput[]) => {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('inputs must be a non-empty array');
    if (inputs.length > 500) throw new Error('Too many assignments in one batch (max 500)');
    for (const input of inputs) {
      if (!input.courseId)     throw new Error('courseId is required on every row');
      if (!input.name?.trim()) throw new Error('Assignment name is required on every row');
      if (!input.dueDate)      throw new Error('dueDate is required on every row');
      validateDueTime(input);
      validateEnums(input);
      // The batch path skipped this while the single-create path had it — and the
      // importer is the likeliest source of a nonsense score in the first place.
      validateGradeFields(input);
    }
    const created = createAssignments(inputs);
    notifyAssignmentsChanged();
    return created;
  });

  ipcMain.handle(IPC.ASSIGNMENTS.UPDATE, (_event, id: string, input: UpdateAssignmentInput) => {
    if (!id) throw new Error('Assignment id is required');
    validateGradeFields(input);
    validateDueTime(input);
    validateEnums(input);
    const updated = updateAssignment(id, input);
    // Covers completing one, which is a status update — and also a moved due
    // date, which changes when the reminder should fire.
    notifyAssignmentsChanged();
    return updated;
  });

  // Note links are captured and removed inside deleteAssignment's transaction now, so
  // the snapshot it returns is a complete record of what went away.
  ipcMain.handle(IPC.ASSIGNMENTS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Assignment id is required');
    const snapshot = deleteAssignment(id);
    notifyAssignmentsChanged();
    return snapshot;
  });

  ipcMain.handle(IPC.ASSIGNMENTS.RESTORE, (_event, snapshot: AssignmentSnapshot) => {
    if (!snapshot?.assignment?.id) throw new Error('Nothing to restore');
    for (const key of ['subtasks', 'studyBlocks', 'noteLinks'] as const) {
      if (!Array.isArray(snapshot[key])) throw new Error('Nothing to restore');
    }
    const restored = restoreAssignment(snapshot);
    // Undo puts the assignment back, so the reminder should come back with it.
    notifyAssignmentsChanged();
    return restored;
  });

  // Move one occurrence, or it and the rest of its series, by a number of days.
  // A whole year either way is far more than any syllabus slip and still well
  // inside what the date math handles; the bound is here so a runaway caller
  // can't walk a semester into 2140.
  ipcMain.handle(IPC.ASSIGNMENTS.SHIFT, (_event, input: ShiftAssignmentsInput) => {
    if (!input?.assignmentId) throw new Error('assignmentId is required');
    assertOneOf(input.scope, SERIES_SCOPES, 'scope');
    if (!Number.isInteger(input.days)) throw new Error('days must be a whole number');
    if (input.days === 0) throw new Error('days must not be zero');
    if (Math.abs(input.days) > 365) throw new Error('days must be within a year either way');
    const result = shiftAssignments(input);
    // Every moved row is a reminder that should now fire on a different day.
    notifyAssignmentsChanged();
    return result;
  });

  // The bulk date write behind a shift and its Undo. Dates are validated for the
  // whole batch before any of it lands, matching the repo's all-or-nothing write:
  // a bad date in row nine shouldn't leave rows one to eight moved.
  ipcMain.handle(IPC.ASSIGNMENTS.SET_DATES, (_event, items: DateSet[]) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array');
    if (items.length > 500) throw new Error('Too many assignments in one batch (max 500)');
    for (const item of items) {
      if (!item?.id) throw new Error('id is required on every row');
      assertIsoDate(item.dueDate, 'dueDate');
    }
    const count = setDates(items);
    notifyAssignmentsChanged();
    return count;
  });

  // Day-One Setup's save: repeating groups and one-off rows together, in one
  // transaction. Everything is validated before any of it is written, because the
  // whole promise of this screen is that a failed save leaves nothing behind —
  // finding out on row 38 that row 12 was bad has to cost you nothing.
  ipcMain.handle(IPC.ASSIGNMENTS.CREATE_BATCH, (_event, input: CreateAssignmentBatchInput) => {
    if (!Array.isArray(input?.series) || !Array.isArray(input?.singles)) {
      throw new Error('series and singles must both be arrays');
    }

    const total =
      input.singles.length +
      input.series.reduce((n, group) => n + (group?.occurrences?.length ?? 0), 0);
    if (total === 0) throw new Error('Nothing to save');
    if (total > 500) throw new Error('Too many assignments in one batch (max 500)');

    for (const group of input.series) {
      if (!group?.courseId) throw new Error('courseId is required on every series');
      if (!Number.isInteger(group.intervalWeeks) || group.intervalWeeks < 1) {
        throw new Error('intervalWeeks must be a whole number of weeks, at least 1');
      }
      // One occurrence is a plain assignment wearing a rule — the renderer already
      // demotes those, so one arriving here means something upstream is confused.
      if (!Array.isArray(group.occurrences) || group.occurrences.length < 2) {
        throw new Error('A series needs at least two occurrences');
      }
      for (const occurrence of group.occurrences) {
        if (!occurrence?.name?.trim()) throw new Error('Assignment name is required on every row');
        assertIsoDate(occurrence.dueDate, 'dueDate');
        validateDueTime(occurrence);
        validateEnums(occurrence);
      }
    }

    for (const single of input.singles) {
      if (!single?.courseId)     throw new Error('courseId is required on every row');
      if (!single.name?.trim())  throw new Error('Assignment name is required on every row');
      assertIsoDate(single.dueDate, 'dueDate');
      validateDueTime(single);
      validateEnums(single);
      validateGradeFields(single);
    }

    const created = createAssignmentBatch(input);
    notifyAssignmentsChanged();
    return created;
  });

  // A rename and/or a due time, applied across a scope. Nothing here is a date,
  // so there's no skip guard — see applyToSeries for why a finished occurrence
  // is renamed along with the rest.
  ipcMain.handle(IPC.ASSIGNMENTS.APPLY_SERIES, (_event, input: ApplyToSeriesInput) => {
    if (!input?.assignmentId) throw new Error('assignmentId is required');
    assertOneOf(input.scope, SERIES_SCOPES, 'scope');
    if (input.name === undefined && input.dueTime === undefined) {
      throw new Error('Nothing to apply — pass a name, a dueTime, or both');
    }
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error('Assignment name is required');
    }
    validateDueTime(input);
    const result = applyToSeries(input);
    // A renamed or re-timed assignment is a changed reminder.
    notifyAssignmentsChanged();
    return result;
  });

  // The bulk name/time write behind the above and its Undo.
  ipcMain.handle(IPC.ASSIGNMENTS.SET_FIELDS, (_event, items: FieldSet[]) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array');
    if (items.length > 500) throw new Error('Too many assignments in one batch (max 500)');
    for (const item of items) {
      if (!item?.id) throw new Error('id is required on every row');
      if (!item.name?.trim()) throw new Error('Assignment name is required on every row');
      validateDueTime(item);
    }
    const count = setFields(items);
    notifyAssignmentsChanged();
    return count;
  });
}
