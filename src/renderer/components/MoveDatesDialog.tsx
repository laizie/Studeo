import { useId, useState } from 'react';
import DialogShell from './DialogShell';
import SeriesScopeField from './SeriesScopeField';
import type { AssignmentStatus, DateSet, SeriesScope, ShiftResult } from '../../shared/types';
import { formatDueDate } from '../../shared/deadlines';
import { cadenceDates, shiftDate, shiftSkipReason } from '../../shared/repeat';
import { showUndoToast } from '../store/useToastStore';
import { cn } from '../lib/utils';
import { INPUT_CLASS } from '../lib/inputClass';

/** The row being moved. Assignments and tasks both reduce to this. */
export interface MoveDatesTarget {
  id: string;
  name: string;
  dueDate: string;
  seriesId: string | null;
  seriesIndex: number | null;
}

/** Enough of a sibling row to count what a scope reaches and what it will skip.
 *  `score` is optional because tasks don't have one. */
export interface MoveDatesSibling {
  id: string;
  series_id: string | null;
  series_index: number | null;
  status: AssignmentStatus;
  score?: number | null;
}

interface Props {
  target: MoveDatesTarget;
  /** Every row of the same kind that's already loaded — only read to count what
   *  a scope would touch, so callers should pass a cached list, not a new fetch. */
  rows: MoveDatesSibling[];
  /** What this dialog calls the thing, in its own copy. */
  noun: 'assignment' | 'task';
  shift: (scope: SeriesScope, days: number) => Promise<ShiftResult>;
  /** Lay this occurrence and the ones after it back out at a fixed interval. */
  respace: (intervalWeeks: number) => Promise<ShiftResult>;
  /** Put the given dates back — the Undo half of a shift. */
  restore: (items: DateSet[]) => void;
  isPending: boolean;
  isError: boolean;
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

/**
 * Move a row's due date — and, when it's part of a repeating series, optionally
 * everything after it.
 *
 * "This and later" is the point of the whole feature: a class falls a week
 * behind, or a chore slips, and the rest of the series slides with it instead of
 * being edited row by row.
 *
 * Shared by assignments and tasks. The two differ in where their rows come from
 * and which IPC channel moves them, so those arrive as props; everything the
 * user actually sees and decides is the same for both, and should stay that way.
 *
 * Scope resets to 'one' every time the dialog opens. Remembering a wider scope
 * would make the next quick nudge quietly rewrite a semester.
 */
export default function MoveDatesDialog({
  target,
  rows,
  noun,
  shift,
  respace,
  restore,
  isPending,
  isError,
  isOpen,
  onClose,
}: Props) {
  const [scope, setScope] = useState<SeriesScope>('one');
  const [customDays, setCustomDays] = useState('');
  const [cadence, setCadence] = useState(1);
  const uid = useId();

  const inSeries = target.seriesId != null && target.seriesIndex != null;
  const siblings = inSeries
    ? rows
        .filter(r => r.series_id === target.seriesId)
        .sort((a, b) => (a.series_index ?? 0) - (b.series_index ?? 0))
    : [];

  // What the chosen scope reaches, mirroring main's own rule: 'this_and_later'
  // counts by series position, not by date, because dates are what's moving.
  const reached = !inSeries
    ? []
    : scope === 'one'
      ? siblings.filter(r => r.id === target.id)
      : scope === 'all'
        ? siblings
        : siblings.filter(r => (r.series_index ?? 0) >= (target.seriesIndex ?? 0));

  // The anchor always moves (the user pointed at it); finished work elsewhere in
  // the series stays put. Previewed here so the dialog promises what main will do.
  const protectedCount = reached.filter(
    r => r.id !== target.id && shiftSkipReason(r) !== null,
  ).length;
  const movingCount = reached.length - protectedCount;

  const parsedCustom = Number(customDays);
  const customValid =
    customDays.trim() !== '' &&
    Number.isInteger(parsedCustom) &&
    parsedCustom !== 0 &&
    Math.abs(parsedCustom) <= 365;

  /**
   * Report a finished move and offer to take it back.
   *
   * Undo replays each row's own previous date, so occurrences that had been
   * moved by hand beforehand go back to where they personally were — which is
   * the whole point when the thing being repaired is a heap of hand-moved dates.
   */
  function report(verb: string, result: ShiftResult) {
    if (result.changed.length === 0) {
      onClose();
      return;
    }

    const plural = result.changed.length === 1 ? noun : `${noun}s`;
    const left =
      result.skipped.length > 0
        ? ` · left ${result.skipped.length} finished ${result.skipped.length === 1 ? 'one' : 'ones'} alone`
        : '';

    showUndoToast(`${verb} ${result.changed.length} ${plural}${left}`, () =>
      restore(result.changed.map(c => ({ id: c.id, dueDate: c.from }))),
    );
    onClose();
  }

  async function applyShift(days: number) {
    try {
      report('Moved', await shift(scope, days));
    } catch {
      // The mutation's global onError already told the user. Staying open with the
      // dialog's state intact is what we want, but the rejection still has to be
      // handled or it becomes an unhandled rejection.
    }
  }

  async function applyRespace() {
    try {
      report('Spaced out', await respace(cadence));
    } catch {
      // As above.
    }
  }

  if (!isOpen) return null;

  // Everything after this occurrence in the series — what a respace would lay out.
  const laterCount = inSeries
    ? siblings.filter(r => (r.series_index ?? 0) > (target.seriesIndex ?? 0)).length
    : 0;
  // The slots those would land on. The anchor keeps slot 0, so drop it, and show
  // only the first few — the sentence above already says how many there are.
  const respacePreview = cadenceDates(target.dueDate, cadence, laterCount + 1).slice(1, 4);

  const previewDays = customValid ? parsedCustom : 7;
  // shiftDate returns '' for a date it can't parse, which should never happen for
  // a stored row — but the preview is the one place that would render it.
  const previewDate = shiftDate(target.dueDate, previewDays);

  return (
    <DialogShell isOpen={isOpen} onClose={onClose} title="Move dates">
      <p className="-mt-3 mb-5 text-xs text-muted">
        {inSeries
          ? `“${target.name}” repeats — move just this one, or slide the rest of the series with it.`
          : `“${target.name}” is currently due ${formatDueDate(target.dueDate)}.`}
      </p>

      {inSeries && (
        <div className="mb-4">
          <SeriesScopeField
            value={scope}
            onChange={setScope}
            label="What moves"
            hint={
              <>
                {movingCount === 1
                  ? `Moves this ${noun} only.`
                  : `Moves ${movingCount} of ${siblings.length} occurrences.`}
                {protectedCount > 0 &&
                  ` ${protectedCount} already finished — ${protectedCount === 1 ? 'it stays' : 'they stay'} put.`}
              </>
            }
          />
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
              disabled={isPending}
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
          disabled={!customValid || isPending}
          className={cn(
            'rounded-lg bg-accent px-4 py-2 text-sm text-accent-ink transition-colors',
            'hover:bg-accent-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {isPending ? 'Moving…' : 'Move'}
        </button>
      </div>

      {/* Putting a bunched-up run back on a rhythm. Only worth showing when there
          is something after this row to lay out. */}
      {laterCount > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">
            Or put them back on a rhythm
          </span>
          <p className="mb-2.5 text-xs text-muted">
            Keeps “{target.name}” on {formatDueDate(target.dueDate)} and lays the{' '}
            {laterCount === 1 ? 'one' : laterCount} after it out from there. Finished ones stay
            where they are.
          </p>

          <div className="mb-2.5 flex gap-1.5">
            {[1, 2].map(weeks => (
              <button
                key={weeks}
                type="button"
                onClick={() => setCadence(weeks)}
                aria-pressed={cadence === weeks}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  cadence === weeks
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line text-ink-soft hover:bg-surface-hi',
                )}
              >
                {weeks === 1 ? 'One a week' : 'Every 2 weeks'}
              </button>
            ))}
            <button
              type="button"
              onClick={applyRespace}
              disabled={isPending}
              className={cn(
                'rounded-lg bg-accent px-4 py-1.5 text-xs text-accent-ink transition-colors',
                'hover:bg-accent-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {isPending ? 'Spacing…' : 'Space them out'}
            </button>
          </div>

          {respacePreview.length > 0 && (
            <p className="text-xs text-muted">
              They’d land on {respacePreview.map(d => formatDueDate(d)).join(', ')}
              {laterCount > respacePreview.length ? ', …' : ''}.
            </p>
          )}
        </div>
      )}

      {/* Concrete landing date, so a shift is never a guess about what +1 week means. */}
      {previewDate && (
        <p className="mt-3 text-xs text-muted">
          This one would land on {formatDueDate(previewDate)}
          {customValid ? '' : ' with +1 week'}.
        </p>
      )}

      {isError && (
        <p className="mt-3 text-sm text-red-600">Something went wrong — please try again.</p>
      )}
    </DialogShell>
  );
}
