import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateStudySessionInput } from '../../../shared/types';

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
