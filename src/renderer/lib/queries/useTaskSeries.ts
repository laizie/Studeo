import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskKeys } from './useTasks';
import type {
  CreateTaskSeriesInput,
  ExtendTaskSeriesInput,
  RestoreTaskOccurrencesInput,
  StopRepeatingTasksInput,
} from '../../../shared/types';

export const taskSeriesKeys = {
  all: ['taskSeries'] as const,
};

export function useTaskSeries() {
  return useQuery({
    queryKey: taskSeriesKeys.all,
    queryFn:  () => window.api.taskSeries.list(),
  });
}

/** Every mutation here writes task rows as well as the series row, so they all
 *  invalidate both caches (mirrors useAssignmentSeries). */
function useSeriesMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskSeriesKeys.all });
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCreateTaskSeries() {
  return useSeriesMutation((input: CreateTaskSeriesInput) => window.api.taskSeries.create(input));
}

/** Add the occurrences that fit a later end date. */
export function useExtendTaskSeries() {
  return useSeriesMutation((input: ExtendTaskSeriesInput) => window.api.taskSeries.extend(input));
}

/**
 * Drop the untouched tail of a task series. Resolves to the removed rows, which
 * useRestoreTaskOccurrences replays as the Undo.
 *
 * Invalidates broadly rather than just the task lists: a removed task could have
 * been in the focus list or on this week's view, and this is rare enough that
 * one full refetch is simpler than chasing every key and always right.
 */
export function useStopRepeatingTasksFrom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StopRepeatingTasksInput) => window.api.taskSeries.stopFrom(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** The Undo: puts the removed occurrences back and restores the series' end date. */
export function useRestoreTaskOccurrences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RestoreTaskOccurrencesInput) =>
      window.api.taskSeries.restoreOccurrences(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** "Stop repeating": drops the rule, keeps every occurrence as a standalone row. */
export function useDeleteTaskSeries() {
  return useSeriesMutation((id: string) => window.api.taskSeries.delete(id));
}
