import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateStudySessionInput, StudySession } from '../../../shared/types';

export const studySessionKeys = {
  all: ['studySessions'] as const,
};

export function useStudySessions() {
  return useQuery({
    queryKey: studySessionKeys.all,
    queryFn:  () => window.api.studySessions.list(),
  });
}

/** Attach an intention/reflection to a logged session (the Focus Mode reflection loop). */
export function useUpdateStudySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStudySessionInput }) =>
      window.api.studySessions.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studySessionKeys.all });
    },
  });
}

/**
 * Remove a mis-logged session (a timer left running, a duplicate). Returns the row so
 * the caller can offer Undo — deleting study history without a takeback would be a
 * worse edge than the one this fixes.
 */
export function useDeleteStudySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.studySessions.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: studySessionKeys.all }),
  });
}

export function useRestoreStudySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (session: StudySession) => window.api.studySessions.restore(session),
    onSuccess: () => qc.invalidateQueries({ queryKey: studySessionKeys.all }),
  });
}
