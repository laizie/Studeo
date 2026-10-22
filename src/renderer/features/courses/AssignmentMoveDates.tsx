import MoveDatesDialog from '../../components/MoveDatesDialog';
import type { Assignment } from '../../../shared/types';
import {
  useAssignments,
  useShiftAssignments,
  useSetAssignmentDates,
} from '../../lib/queries/useAssignments';

interface Props {
  assignment: Assignment;
  isOpen: boolean;
  onClose: () => void;
}

/** Wires the shared Move dates dialog to the assignment side: this course's rows
 *  for the scope preview, and the assignment shift/setDates channels. */
export default function AssignmentMoveDates({ assignment, isOpen, onClose }: Props) {
  const shift = useShiftAssignments();
  const setDates = useSetAssignmentDates();
  // Same query key the course page already uses, so this reads from cache rather
  // than fetching: it's only here to count what a scope would touch.
  const { data: rows = [] } = useAssignments({ courseId: assignment.course_id });

  return (
    <MoveDatesDialog
      target={{
        id: assignment.id,
        name: assignment.name,
        dueDate: assignment.due_date,
        seriesId: assignment.series_id,
        seriesIndex: assignment.series_index,
      }}
      rows={rows}
      noun="assignment"
      shift={(scope, days) => shift.mutateAsync({ assignmentId: assignment.id, scope, days })}
      restore={items => setDates.mutate(items)}
      isPending={shift.isPending}
      isError={shift.isError}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
}
