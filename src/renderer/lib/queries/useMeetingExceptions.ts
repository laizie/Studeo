import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateMeetingExceptionInput } from '../../../shared/types';

export const meetingExceptionKeys = {
  all:  ['meeting_exceptions'] as const,
  list: (filters: { meetingId?: string }) => ['meeting_exceptions', filters] as const,
};

export function useMeetingExceptions(filters: { meetingId?: string } = {}) {
  return useQuery({
    queryKey: meetingExceptionKeys.list(filters),
    queryFn:  () => window.api.meetingExceptions.list(filters),
  });
}

export function useCreateMeetingException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMeetingExceptionInput) => window.api.meetingExceptions.create(input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: meetingExceptionKeys.all }),
  });
}

export function useDeleteMeetingException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.meetingExceptions.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: meetingExceptionKeys.all }),
  });
}
