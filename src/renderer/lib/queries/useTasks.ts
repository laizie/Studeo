import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTaskInput,
  DateSet,
  ShiftTasksInput,
  UpdateTaskInput,
} from '../../../shared/types';

export const taskKeys = {
  all:    ['tasks']             as const,
  detail: (id: string) => ['tasks', id] as const,
};

export function useTasks() {
  return useQuery({
    queryKey: taskKeys.all,
    queryFn:  () => window.api.tasks.list(),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => window.api.tasks.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      window.api.tasks.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.tasks.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/**
 * Move a task, or it and the rest of its series, by a number of days.
 *
 * Resolves to the rows that actually moved (with their old dates) plus the
 * finished ones it refused to touch — so the caller can report honestly and hand
 * the before-dates to useSetTaskDates as an Undo.
 */
export function useShiftTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ShiftTasksInput) => window.api.tasks.shift(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/** Write exact dates to many tasks in one transaction — the Undo half of a shift. */
export function useSetTaskDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: DateSet[]) => window.api.tasks.setDates(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
