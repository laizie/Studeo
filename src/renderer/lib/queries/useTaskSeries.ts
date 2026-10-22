import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskKeys } from './useTasks';
import type { CreateTaskSeriesInput, ExtendTaskSeriesInput } from '../../../shared/types';

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

/** "Stop repeating": drops the rule, keeps every occurrence as a standalone row. */
export function useDeleteTaskSeries() {
  return useSeriesMutation((id: string) => window.api.taskSeries.delete(id));
}
