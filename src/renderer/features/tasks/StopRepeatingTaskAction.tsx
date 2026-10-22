import { useState } from 'react';
import { CalendarX } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { Task } from '../../../shared/types';
import { useTasks } from '../../lib/queries/useTasks';
import {
  useStopRepeatingTasksFrom,
  useRestoreTaskOccurrences,
} from '../../lib/queries/useTaskSeries';
import { showToast, showUndoToast } from '../../store/useToastStore';

interface Props {
  task: Task;
  /** Called once the cut lands — the anchor row may no longer exist. */
  onDone: () => void;
}

/**
 * "The rest of these aren't happening", for a repeating task.
 *
 * Mirrors StopRepeatingAction on the assignment side, and is allowed to promise
 * more than it does: nothing in the schema hangs off a task, so whether an
 * occurrence survives depends only on its status — which the renderer already
 * has. The confirmation can therefore say exactly what will happen instead of
 * naming an upper bound.
 *
 * Hidden on the first occurrence, where cutting would leave a rule with nothing
 * under it. That case is "stop repeating", which is a different thing to want.
 */
export default function StopRepeatingTaskAction({ task, onDone }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stopFrom = useStopRepeatingTasksFrom();
  const restore = useRestoreTaskOccurrences();
  const { data: rows = [] } = useTasks();

  const index = task.series_index;
  if (task.series_id == null || index == null || index <= 1) return null;

  const tail = rows.filter(t => t.series_id === task.series_id && (t.series_index ?? 0) >= index);
  const goes = tail.filter(t => t.status === 'not_started').length;
  const stays = tail.length - goes;

  function handleConfirm() {
    stopFrom.mutate(
      { taskId: task.id },
      {
        onSuccess: ({ seriesId, removed, kept, previousUntilDate }) => {
          setConfirmOpen(false);
          onDone();

          if (removed.length === 0) {
            showToast(
              kept.length === 1
                ? 'Nothing removed — you’ve already started that one.'
                : `Nothing removed — you’ve already started those ${kept.length}.`,
            );
            return;
          }

          const what = removed.length === 1 ? '1 occurrence' : `${removed.length} occurrences`;
          const spared = kept.length > 0 ? ` · kept ${kept.length} you'd started` : '';
          showUndoToast(`Removed ${what}${spared}`, () =>
            restore.mutate({ seriesId, untilDate: previousUntilDate, tasks: removed }),
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
        className="mt-3 inline-flex items-center gap-1.5 rounded text-xs text-muted transition-colors hover:text-red-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <CalendarX size={13} />
        {stopFrom.isPending ? 'Removing…' : 'Stop repeating from here…'}
      </button>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Stop repeating from “${task.name}”?`}
        message={
          // Three shapes rather than one glued together: "Nothing … and keeps …"
          // changes subject halfway through and reads as a mistake.
          (goes === 0
            ? `Nothing here would be removed — you've already started ${
                stays === 1 ? 'that one' : 'all of them'
              }.`
            : `This removes ${goes === 1 ? '1 occurrence' : `${goes} occurrences`}` +
              (stays > 0
                ? `, and keeps ${stays === 1 ? 'the one' : `the ${stays}`} you've already started.`
                : '.')) + ' The series ends at the last one left, and you can undo it.'
        }
        confirmLabel="Remove them"
        onConfirm={handleConfirm}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
