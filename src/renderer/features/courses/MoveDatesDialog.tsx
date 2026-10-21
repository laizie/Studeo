import { useId, useState } from 'react';
import DialogShell from '../../components/DialogShell';
import type { Assignment, SeriesScope } from '../../../shared/types';
import { formatDueDate } from '../../../shared/deadlines';
import { shiftDate, shiftSkipReason } from '../../../shared/repeat';
import { useAssignments, useShiftAssignments, useSetAssignmentDates } from '../../lib/queries/useAssignments';
import { showUndoToast } from '../../store/useToastStore';
import { cn } from '../../lib/utils';
import { INPUT_CLASS } from '../../lib/inputClass';

interface Props {
  assignment: Assignment;
  isOpen: boolean;
  onClose: () => void;
}

/** The nudges worth a single click. Everything else goes through the custom field. */
const QUICK_MOVES: { days: number; label: string }[] = [
  { days: -7, label: '−1 week' },
  { days: -1, label: '−1 day' },
  { days: 1, label: '+1 day' },
  { days: 7, label: '+1 week' },
];

const SCOPE_LABELS: Record<SeriesScope, string> = {
  one: 'This one',
  this_and_later: 'This and later',
  all: 'All of them',
};

/**
 * Move an assignment's due date — and, when it's part of a repeating series,
 * optionally everything after it.
 *
 * "This and later" is the point of the whole feature: a class falls a week
 * behind and the rest of the semester slides with it, which used to mean editing
 * every remaining row by hand.
 *
 * Scope defaults to 'one' every time the dialog opens. Remembering a wider scope
 * would make the next quick nudge quietly rewrite a semester.
 */
export default function MoveDatesDialog({ assignment, isOpen, onClose }: Props) {
  const [scope, setScope] = useState<SeriesScope>('one');
  const [customDays, setCustomDays] = useState('');
  const uid = useId();

  const shift = useShiftAssignments();
  const setDates = useSetAssignmentDates();

  // Same query key the course page already uses, so this reads from cache rather
  // than fetching: it's only here to count what a scope would touch.
  const { data: courseAssignments = [] } = useAssignments({ courseId: assignment.course_id });

  const inSeries = assignment.series_id != null && assignment.series_index != null;
  const siblings = inSeries
    ? courseAssignments
        .filter(a => a.series_id === assignment.series_id)
        .sort((a, b) => (a.series_index ?? 0) - (b.series_index ?? 0))
    : [assignment];

  // What the chosen scope reaches, mirroring the repo's own rule: 'this_and_later'
  // counts by series position, not by date, because dates are what's moving.
  const reached =
    !inSeries || scope === 'one'
      ? [assignment]
      : scope === 'all'
        ? siblings
        : siblings.filter(a => (a.series_index ?? 0) >= (assignment.series_index ?? 0));

  // The anchor always moves (the user pointed at it); finished work elsewhere in
  // the series stays put. Previewed here so the dialog promises what main will do.
  const protectedCount = reached.filter(
    a => a.id !== assignment.id && shiftSkipReason(a) !== null,
  ).length;
  const movingCount = reached.length - protectedCount;

  const parsedCustom = Number(customDays);
  const customValid =
    customDays.trim() !== '' &&
    Number.isInteger(parsedCustom) &&
    parsedCustom !== 0 &&
    Math.abs(parsedCustom) <= 365;

  async function applyShift(days: number) {
    try {
      const result = await shift.mutateAsync({ assignmentId: assignment.id, scope, days });
      if (result.changed.length === 0) {
        onClose();
        return;
      }

      const moved = `Moved ${result.changed.length} ${result.changed.length === 1 ? 'assignment' : 'assignments'}`;
      const left = result.skipped.length > 0
        ? ` · left ${result.skipped.length} finished ${result.skipped.length === 1 ? 'one' : 'ones'} alone`
        : '';

      // Undo replays each row's own previous date, so occurrences that had been
      // moved by hand before the shift go back to where they personally were.
      showUndoToast(moved + left, () =>
        setDates.mutate(result.changed.map(c => ({ id: c.id, dueDate: c.from }))),
      );
      onClose();
    } catch {
      // mutateAsync rethrows; the mutation cache's global onError already told the
      // user. Staying open with the dialog's state intact is what we want, but the
      // rejection still has to be handled or it becomes an unhandled rejection.
    }
  }

  if (!isOpen) return null;

  const previewDays = customValid ? parsedCustom : 7;
  // shiftDate returns '' for a date it can't parse, which should never happen for
  // a stored row — but the preview is the one place that would render it.
  const previewDate = shiftDate(assignment.due_date, previewDays);

  return (
    <DialogShell isOpen={isOpen} onClose={onClose} title="Move dates">
      <p className="-mt-3 mb-5 text-xs text-muted">
        {inSeries
          ? `“${assignment.name}” repeats — move just this one, or slide the rest of the series with it.`
          : `“${assignment.name}” is currently due ${formatDueDate(assignment.due_date)}.`}
      </p>

      {inSeries && (
        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">What moves</span>
          <div className="flex gap-1.5">
            {(Object.keys(SCOPE_LABELS) as SeriesScope[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setScope(option)}
                aria-pressed={scope === option}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  scope === option
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line text-ink-soft hover:bg-surface-hi',
                )}
              >
                {SCOPE_LABELS[option]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {movingCount === 1
              ? 'Moves this assignment only.'
              : `Moves ${movingCount} of ${siblings.length} occurrences.`}
            {protectedCount > 0 &&
              ` ${protectedCount} already finished — ${protectedCount === 1 ? 'it stays' : 'they stay'} put.`}
          </p>
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">By how much</span>
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_MOVES.map(move => (
            <button
              key={move.days}
              type="button"
              onClick={() => applyShift(move.days)}
              disabled={shift.isPending}
              className={cn(
                'rounded-lg border border-line px-2 py-2 text-xs text-ink-soft transition-colors',
                'hover:bg-surface-hi disabled:opacity-50',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              )}
            >
              {move.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`${uid}-days`} className="mb-1 block text-xs text-muted">
            or by a number of days
          </label>
          <input
            id={`${uid}-days`}
            type="number"
            value={customDays}
            onChange={e => setCustomDays(e.target.value)}
            placeholder="e.g. 3 or −2"
            className={INPUT_CLASS}
          />
        </div>
        <button
          type="button"
          onClick={() => applyShift(parsedCustom)}
          disabled={!customValid || shift.isPending}
          className={cn(
            'rounded-lg bg-accent px-4 py-2 text-sm text-accent-ink transition-colors',
            'hover:bg-accent-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {shift.isPending ? 'Moving…' : 'Move'}
        </button>
      </div>

      {/* Concrete landing date, so a shift is never a guess about what +1 week means. */}
      {previewDate && (
        <p className="mt-3 text-xs text-muted">
          This one would land on {formatDueDate(previewDate)}
          {customValid ? '' : ' with +1 week'}.
        </p>
      )}

      {shift.isError && (
        <p className="mt-3 text-sm text-red-600">Something went wrong — please try again.</p>
      )}
    </DialogShell>
  );
}
