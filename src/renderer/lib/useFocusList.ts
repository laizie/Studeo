import { useMemo } from 'react';
import { useStudyListStore } from '../store/useStudyListStore';
import { useAssignments } from './queries/useAssignments';
import { useTasks } from './queries/useTasks';
import { useCourses } from './queries/useCourses';
import { resolveFocusList, type FocusListItem } from '../../shared/focusList';

export type { FocusListItem };

/**
 * Today's focus list, resolved against the live data.
 *
 * The store holds only which items are on the list; everything shown about them —
 * name, course, done — is looked up from the query cache through the pure
 * resolveFocusList (shared/focusList.ts, where it's unit-tested). So the list
 * agrees with the rest of the app by construction: tick an assignment off
 * anywhere and it's ticked here, because both are reading the same row.
 */
export function useFocusList(): FocusListItem[] {
  const entries = useStudyListStore(s => s.items);
  const { data: assignments = [] } = useAssignments();
  const { data: tasks       = [] } = useTasks();
  const { data: courses     = [] } = useCourses();

  return useMemo(
    () => resolveFocusList(entries, assignments, tasks, courses),
    [entries, assignments, tasks, courses],
  );
}
