import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AssignmentStatus,
  CreateAssignmentInput,
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

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.assignments.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: assignmentKeys.all }),
  });
}
