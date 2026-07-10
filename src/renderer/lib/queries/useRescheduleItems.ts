import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentKeys } from './useAssignments';
import { taskKeys } from './useTasks';

/** The minimum we need to reschedule a row: which table, which id. A per-item
 *  dueDate overrides the batch date — that's how Undo restores each row to the
 *  different date it had before the move. */
export interface RescheduleTarget {
  kind: 'assignment' | 'task';
  id: string;
  dueDate?: string;
}

/**
 * Move a batch of assignments/tasks to a new due date in one action (the Weekly
 * Review's "move all overdue to this week"). There's no bulk IPC channel, so we
 * fan out to the existing per-row update calls with Promise.all — but invalidate
 * the assignment/task caches only ONCE, after they all settle, so the list
 * refreshes a single time instead of flickering per row.
 *
 * (If this ever needs to be atomic — all-or-nothing across rows — that's the cue
 * to add a real `updateMany` IPC handler wrapped in a DB transaction, like
 * assignments.createMany. For a handful of local writes, the fan-out is fine.)
 */
export function useRescheduleItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, dueDate }: { items: RescheduleTarget[]; dueDate: string }) => {
      await Promise.all(
        items.map(item =>
          item.kind === 'assignment'
            ? window.api.assignments.update(item.id, { dueDate: item.dueDate ?? dueDate })
            : window.api.tasks.update(item.id, { dueDate: item.dueDate ?? dueDate }),
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
