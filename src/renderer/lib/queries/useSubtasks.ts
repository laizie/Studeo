import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateSubtaskInput, UpdateSubtaskInput, Subtask } from '../../../shared/types';

export const subtaskKeys = {
  all: ['subtasks'] as const,
};

// One unfiltered query shared by every row: subtask volume is tiny, and a
// single cache entry beats one IPC round-trip per assignment row.
export function useSubtasks() {
  return useQuery({
    queryKey: subtaskKeys.all,
    queryFn:  () => window.api.subtasks.list(),
  });
}

const NO_SUBTASKS: Subtask[] = [];

/**
 * Just one assignment's steps, from the one shared query.
 *
 * Every AssignmentRow used to call useSubtasks() and filter the full list itself. The
 * fetch was deduplicated, so that part was fine — the cost was that all N rows
 * re-rendered and each re-scanned the whole array whenever ANY subtask anywhere
 * changed. With 40 rows open on This Week, one keystroke in a checklist meant 40 full
 * scans and 40 re-renders.
 *
 * `select` fixes both at once, and is worth understanding: React Query runs it per
 * observer and applies structural sharing to the result, so a row whose own slice is
 * unchanged gets back the *same array reference* and doesn't re-render at all. The
 * filter still runs, but only its result decides whether React does any work.
 *
 * The shared NO_SUBTASKS constant matters for the same reason — returning a fresh []
 * for the (common) no-steps case would defeat the reference check.
 */
export function useSubtasksFor(assignmentId: string) {
  return useQuery({
    queryKey: subtaskKeys.all,
    queryFn:  () => window.api.subtasks.list(),
    select: (all: Subtask[]) => {
      const mine = all.filter(s => s.assignment_id === assignmentId);
      return mine.length === 0 ? NO_SUBTASKS : mine;
    },
  });
}

export function useCreateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubtaskInput) => window.api.subtasks.create(input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: subtaskKeys.all }),
  });
}

export function useUpdateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSubtaskInput }) =>
      window.api.subtasks.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: subtaskKeys.all }),
  });
}

export function useDeleteSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.subtasks.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: subtaskKeys.all }),
  });
}
