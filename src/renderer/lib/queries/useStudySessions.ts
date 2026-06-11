import { useQuery } from '@tanstack/react-query';

export const studySessionKeys = {
  all: ['studySessions'] as const,
};

export function useStudySessions() {
  return useQuery({
    queryKey: studySessionKeys.all,
    queryFn:  () => window.api.studySessions.list(),
  });
}
