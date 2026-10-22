import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentKeys } from './useAssignments';
import type {
  CreateAssignmentSeriesInput,
  ExtendAssignmentSeriesInput,
  LinkIntoSeriesInput,
  RestoreOccurrencesInput,
  StopRepeatingInput,
} from '../../../shared/types';

export const assignmentSeriesKeys = {
  all:  ['assignmentSeries'] as const,
  list: (filters: { courseId?: string }) => ['assignmentSeries', filters] as const,
};

export function useAssignmentSeries(filters: { courseId?: string } = {}) {
  return useQuery({
    queryKey: assignmentSeriesKeys.list(filters),
    queryFn:  () => window.api.assignmentSeries.list(filters),
  });
}

/**
 * Every mutation here writes `assignments` rows as well as the series row, so
 * they all invalidate both caches. Creating a series is the new path behind
 * "Repeat this assignment" — the rows it produces are ordinary assignments, which
 * is why the assignment lists have to refetch too.
 */
function useSeriesMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentSeriesKeys.all });
      qc.invalidateQueries({ queryKey: assignmentKeys.all });
    },
  });
}

export function useCreateAssignmentSeries() {
  return useSeriesMutation((input: CreateAssignmentSeriesInput) =>
    window.api.assignmentSeries.create(input),
  );
}

/** Add the occurrences that fit a later end date ("the prof added two more"). */
export function useExtendAssignmentSeries() {
  return useSeriesMutation((input: ExtendAssignmentSeriesInput) =>
    window.api.assignmentSeries.extend(input),
  );
}

/** Bind rows that already exist into a series, leaving their names alone. */
export function useLinkIntoSeries() {
  return useSeriesMutation((input: LinkIntoSeriesInput) => window.api.assignmentSeries.link(input));
}

/**
 * Drop the untouched tail of a series. Resolves to full snapshots of what went,
 * which useRestoreOccurrences replays as the Undo.
 *
 * Invalidates broadly rather than just the assignment lists: a removed
 * occurrence could have been on the calendar, in a study plan or in the focus
 * list, and this is rare enough that one full refetch is simpler than chasing
 * every key and always right.
 */
export function useStopRepeatingFrom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StopRepeatingInput) => window.api.assignmentSeries.stopFrom(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** The Undo: puts the removed occurrences back and restores the series' end date. */
export function useRestoreOccurrences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RestoreOccurrencesInput) =>
      window.api.assignmentSeries.restoreOccurrences(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** "Stop repeating": drops the rule, keeps every occurrence as a standalone row. */
export function useDeleteAssignmentSeries() {
  return useSeriesMutation((id: string) => window.api.assignmentSeries.delete(id));
}
