import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateSubtaskInput, UpdateSubtaskInput } from '../../../shared/types';

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
