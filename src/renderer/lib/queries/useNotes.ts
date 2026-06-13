import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateNoteInput, UpdateNoteInput } from '../../../shared/types';

export const noteKeys = {
  all:    ['notes']                                  as const,
  list:   (filters: { archived?: boolean }) =>
            ['notes', 'list', filters]               as const,
  detail: (id: string) => ['notes', 'detail', id]    as const,
  search: (query: string) => ['notes', 'search', query] as const,
};

export function useNotes(filters: { archived?: boolean } = {}) {
  return useQuery({
    queryKey: noteKeys.list(filters),
    queryFn:  () => window.api.notes.list(filters),
  });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: noteKeys.detail(id ?? ''),
    queryFn:  () => window.api.notes.get(id!),
    enabled:  !!id,
  });
}

export function useSearchNotes(query: string) {
  return useQuery({
    queryKey: noteKeys.search(query),
    queryFn:  () => window.api.notes.search(query),
    // Don't fire a search for an empty box.
    enabled:  query.trim().length > 0,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => window.api.notes.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNoteInput }) =>
      window.api.notes.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.notes.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
}
