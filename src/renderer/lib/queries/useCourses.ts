import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateCourseInput, UpdateCourseInput } from '../../../shared/types';

// Query keys are the cache identifiers React Query uses. Any hook that shares
// a key shares its data — they all see the same cached response.
// Defining them in one place prevents key typos from creating silent cache splits.
export const courseKeys = {
  all:    ['courses']             as const,
  detail: (id: string) => ['courses', id] as const,
};

export function useCourses() {
  return useQuery({
    queryKey: courseKeys.all,
    queryFn:  () => window.api.courses.list(),
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: courseKeys.detail(id),
    queryFn:  () => window.api.courses.get(id),
    enabled:  !!id,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCourseInput) => window.api.courses.create(input),
    // After a successful create, mark the list as stale so React Query refetches it.
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.all }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCourseInput }) =>
      window.api.courses.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.all }),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.courses.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: courseKeys.all }),
  });
}
