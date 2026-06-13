import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateNoteLinkInput, NoteLinkEntity } from '../../../shared/types';
import { noteKeys } from './useNotes';

export const noteLinkKeys = {
  all: ['noteLinks'] as const,
  forNote: (noteId: string) => ['noteLinks', 'forNote', noteId] as const,
  forEntity: (entityType: NoteLinkEntity, entityId: string, occurrenceDate?: string) =>
    ['noteLinks', 'forEntity', entityType, entityId, occurrenceDate ?? null] as const,
};

/** The links attached to a note — drives the editor's link bar. */
export function useNoteLinks(noteId: string | undefined) {
  return useQuery({
    queryKey: noteLinkKeys.forNote(noteId ?? ''),
    queryFn: () => window.api.noteLinks.listForNote(noteId!),
    enabled: !!noteId,
  });
}

/** The notes attached to an entity — drives per-entity embeds (course/assignment/…).
    occurrenceDate scopes to a single dated lecture for class_meeting embeds. */
export function useEntityNotes(
  entityType: NoteLinkEntity,
  entityId: string | undefined,
  occurrenceDate?: string,
) {
  return useQuery({
    queryKey: noteLinkKeys.forEntity(entityType, entityId ?? '', occurrenceDate),
    queryFn: () => window.api.noteLinks.notesForEntity(entityType, entityId!, occurrenceDate),
    enabled: !!entityId,
  });
}

// Links change what shows on both ends (the note's link bar and the entity's note list),
// so a mutation refreshes all link queries — and the note lists, since a fresh note may
// have been created and linked in the same flow.
function invalidateLinks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: noteLinkKeys.all });
  qc.invalidateQueries({ queryKey: noteKeys.all });
}

export function useCreateNoteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteLinkInput) => window.api.noteLinks.create(input),
    onSuccess: () => invalidateLinks(qc),
  });
}

export function useDeleteNoteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.noteLinks.delete(id),
    onSuccess: () => invalidateLinks(qc),
  });
}
