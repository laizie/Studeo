import { useState } from 'react';
import { CalendarX } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { Assignment } from '../../../shared/types';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useStopRepeatingFrom, useRestoreOccurrences } from '../../lib/queries/useAssignmentSeries';
import { showToast, showUndoToast } from '../../store/useToastStore';

interface Props {
  assignment: Assignment;
  /** Called once the cut lands — the anchor row may no longer exist. */
  onDone: () => void;
}

/**
 * "The rest of these aren't happening": removes this occurrence and the later
 * ones that are still untouched.
 *
 * Hidden on the first occurrence, because cutting from there would leave a rule
 * with nothing under it — that case is "stop repeating", which drops the rule
 * and keeps the rows, and is a different thing to want. Main refuses it too;
 * this just doesn't offer what would be refused.
 *
 * The confirmation names a count of candidates rather than a precise outcome,
 * and that's deliberate. Whether an occurrence survives depends partly on
 * whether it has steps, planned study blocks or linked notes hanging off it —
 * which the renderer can't know without fetching all three for every row. So
 * the prompt is honest about the upper bound, and the toast afterwards reports
 * exactly what happened.
 */
export default function StopRepeatingAction({ assignment, onDone }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stopFrom = useStopRepeatingFrom();
  const restore = useRestoreOccurrences();
  const { data: rows = [] } = useAssignments({ courseId: assignment.course_id });

  const index = assignment.series_index;
  if (assignment.series_id == null || index == null || index <= 1) return null;

  const candidates = rows.filter(
    r => r.series_id === assignment.series_id && (r.series_index ?? 0) >= index,
  ).length;

  function handleConfirm() {
    stopFrom.mutate(
      { assignmentId: assignment.id },
      {
        onSuccess: ({ seriesId, removed, kept, previousUntilDate }) => {
          setConfirmOpen(false);
          onDone();

          if (removed.length === 0) {
            showToast(
              kept.length === 1
                ? 'Nothing removed — that one has work in it.'
                : `Nothing removed — those ${kept.length} all have work in them.`,
            );
            return;
          }

          const what = removed.length === 1 ? '1 occurrence' : `${removed.length} occurrences`;
          const spared =
            kept.length > 0
              ? ` · kept ${kept.length} you'd started`
              : '';
          showUndoToast(`Removed ${what}${spared}`, () =>
            restore.mutate({ seriesId, untilDate: previousUntilDate, snapshots: removed }),
          );
        },
      },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={stopFrom.isPending}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-red-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded"
      >
        <CalendarX size={13} />
        {stopFrom.isPending ? 'Removing…' : 'Stop repeating from here…'}
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Stop repeating from “${assignment.name}”?`}
        message={
          (candidates === 1
            ? 'This one is up for removal'
            : `This one and the ${candidates - 1} after it are up for removal`) +
          ` — but anything you've already done, graded, started or attached work to stays. ` +
          `The series ends at the last one left, and you can undo it.`
        }
        confirmLabel="Remove them"
        onConfirm={handleConfirm}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
