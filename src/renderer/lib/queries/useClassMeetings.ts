import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateClassMeetingInput, UpdateClassMeetingInput } from '../../../shared/types';

export const classMeetingKeys = {
  all:  ['class_meetings'] as const,
  list: (filters: { courseId?: string }) => ['class_meetings', filters] as const,
};

export function useClassMeetings(filters: { courseId?: string } = {}) {
  return useQuery({
    queryKey: classMeetingKeys.list(filters),
    queryFn:  () => window.api.classMeetings.list(filters),
  });
}

export function useCreateClassMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClassMeetingInput) => window.api.classMeetings.create(input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: classMeetingKeys.all }),
  });
}

export function useUpdateClassMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClassMeetingInput }) =>
      window.api.classMeetings.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: classMeetingKeys.all }),
  });
}

export function useDeleteClassMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.classMeetings.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: classMeetingKeys.all }),
  });
}
