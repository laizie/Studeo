import { ipcMain } from 'electron';
import { IPC, ASSIGNMENT_TYPES } from '../../shared/types';
import type {
  CreateAssignmentSeriesInput,
  ExtendAssignmentSeriesInput,
} from '../../shared/types';
import { assertIsoDate, assertOptionalOneOf } from '../../shared/validate';
import {
  listAssignmentSeries,
  getAssignmentSeries,
  createAssignmentSeries,
  extendAssignmentSeries,
  deleteAssignmentSeries,
} from '../db/repositories/assignmentSeriesRepo';
import { notifyAssignmentsChanged } from '../applereminders';

// Same rule as the single-assignment path: absent or null means all-day.
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function validateDueTime(input: { dueTime?: string | null }): void {
  if (input.dueTime != null && !HHMM_RE.test(input.dueTime)) {
    throw new Error('dueTime must be "HH:MM" (24-hour), or null for all-day');
  }
}

// The dialog offers weekly and biweekly, but main doesn't get to assume that —
// an interval of 0 would make generateRepeats' cursor stand still, and a
// fractional one would silently produce nothing.
function validateInterval(value: unknown): void {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error('intervalWeeks must be a whole number of weeks, at least 1');
  }
  if ((value as number) > 52) {
    throw new Error('intervalWeeks must be at most 52');
  }
}

export function registerAssignmentSeriesHandlers(): void {
  ipcMain.handle(IPC.ASSIGNMENT_SERIES.LIST, (_event, filters?: { courseId?: string }) =>
    listAssignmentSeries(filters ?? {})
  );

  ipcMain.handle(IPC.ASSIGNMENT_SERIES.CREATE, (_event, input: CreateAssignmentSeriesInput) => {
    if (!input?.courseId)    throw new Error('courseId is required');
    if (!input.name?.trim()) throw new Error('Assignment name is required');
    assertIsoDate(input.anchorDate, 'anchorDate');
    assertIsoDate(input.untilDate, 'untilDate');
    // A series whose end is on or before its start has exactly one occurrence,
    // which is a plain assignment wearing a rule. Refuse it rather than leave a
    // one-row "series" lying around for later edits to reason about.
    if (input.untilDate <= input.anchorDate) {
      throw new Error('untilDate must be after anchorDate');
    }
    validateInterval(input.intervalWeeks);
    validateDueTime(input);
    assertOptionalOneOf(input.type, ASSIGNMENT_TYPES, 'type');

    const created = createAssignmentSeries(input);
    // A dozen new rows, each wanting a reminder.
    notifyAssignmentsChanged();
    return created;
  });

  ipcMain.handle(IPC.ASSIGNMENT_SERIES.EXTEND, (_event, input: ExtendAssignmentSeriesInput) => {
    if (!input?.seriesId) throw new Error('seriesId is required');
    assertIsoDate(input.untilDate, 'untilDate');

    // Read the series here rather than letting the repo shrug: pulling the end
    // date backwards generates nothing, and "nothing happened" is a worse answer
    // than "that date is before the series already ends".
    const series = getAssignmentSeries(input.seriesId);
    if (!series) throw new Error('Series not found');
    if (input.untilDate <= series.until_date) {
      throw new Error('untilDate must be later than the series already runs');
    }

    const extended = extendAssignmentSeries(input);
    notifyAssignmentsChanged();
    return extended;
  });

  // Drops the rule only — every occurrence stays as a standalone assignment, so
  // nothing about the reminder mirror changes and there's nothing to notify.
  ipcMain.handle(IPC.ASSIGNMENT_SERIES.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Series id is required');
    deleteAssignmentSeries(id);
  });
}
