import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTermInput, UpdateTermInput } from '../../../shared/types';

export const termKeys = {
  all: ['terms'] as const,
};

export function useTerms() {
  return useQuery({
    queryKey: termKeys.all,
    queryFn:  () => window.api.terms.list(),
  });
}

export function useCreateTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTermInput) => window.api.terms.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: termKeys.all }),
  });
}

export function useUpdateTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTermInput }) =>
      window.api.terms.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: termKeys.all }),
  });
}

export function useDeleteTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.terms.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: termKeys.all });
      // Deleting a term nulls out term_id on courses — refetch them too
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}
