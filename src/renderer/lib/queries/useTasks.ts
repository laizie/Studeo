import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskInput, UpdateTaskInput } from '../../../shared/types';

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
