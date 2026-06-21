import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateStudyBlockInput, UpdateStudyBlockInput } from '../../../shared/types';

export const studyBlockKeys = {
  all: ['studyBlocks'] as const,
};

export function useStudyBlocks() {
  return useQuery({
    queryKey: studyBlockKeys.all,
    queryFn:  () => window.api.studyBlocks.list(),
  });
}

export function useCreateStudyBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inputs: CreateStudyBlockInput[]) => window.api.studyBlocks.createMany(inputs),
    onSuccess: () => { qc.invalidateQueries({ queryKey: studyBlockKeys.all }); },
  });
}

export function useUpdateStudyBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStudyBlockInput }) =>
      window.api.studyBlocks.update(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: studyBlockKeys.all }); },
  });
}

/** Clear an exam's existing plan (the dialog's "Replace" flow). */
export function useDeleteStudyBlocksForAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => window.api.studyBlocks.deleteForAssignment(assignmentId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: studyBlockKeys.all }); },
  });
}
