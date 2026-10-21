import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AssignmentDateSet,
  AssignmentSnapshot,
  AssignmentStatus,
  CreateAssignmentInput,
  ShiftAssignmentsInput,
  UpdateAssignmentInput,
} from '../../../shared/types';

export const assignmentKeys = {
  all:     ['assignments']                                                as const,
  list:    (filters: { courseId?: string; status?: AssignmentStatus }) =>
             ['assignments', filters]                                     as const,
  detail:  (id: string) => ['assignments', id]                          as const,
};

export function useAssignments(filters: { courseId?: string; status?: AssignmentStatus } = {}) {
  return useQuery({
    queryKey: assignmentKeys.list(filters),
    queryFn:  () => window.api.assignments.list(filters),
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssignmentInput) => window.api.assignments.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentKeys.all }),
  });
}

export function useCreateAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inputs: CreateAssignmentInput[]) => window.api.assignments.createMany(inputs),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentKeys.all }),
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssignmentInput }) =>
      window.api.assignments.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentKeys.all }),
  });
}

/**
 * Deleting returns a snapshot of everything that went with it (steps, planned study
 * blocks, note links) so Undo can restore it exactly — see useRestoreAssignment.
 *
 * Invalidates broadly rather than just the assignment lists: the delete also touches
 * subtasks, study blocks and note links, and it's a rare enough action that one full
 * refetch is simpler than chasing four keys and always correct.
 */
export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.assignments.delete(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** The Undo for a deleted assignment: puts the snapshot back under the same ids. */
export function useRestoreAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (snapshot: AssignmentSnapshot) => window.api.assignments.restore(snapshot),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Move an occurrence, or it and the rest of its series, by a number of days.
 *
 * Resolves to the list of rows that actually moved (with their old dates) plus
 * the finished ones it refused to touch — so the caller can both report honestly
 * and hand the before-dates to useSetAssignmentDates as an Undo.
 */
export function useShiftAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ShiftAssignmentsInput) => window.api.assignments.shift(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentKeys.all }),
  });
}

/** Write exact dates to many rows in one transaction — the Undo half of a shift. */
export function useSetAssignmentDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: AssignmentDateSet[]) => window.api.assignments.setDates(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentKeys.all }),
  });
}
