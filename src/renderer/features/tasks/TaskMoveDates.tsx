import MoveDatesDialog from '../../components/MoveDatesDialog';
import type { Task } from '../../../shared/types';
import {
  useTasks,
  useShiftTasks,
  useSetTaskDates,
  useRespaceTasks,
} from '../../lib/queries/useTasks';

interface Props {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
}

/** Wires the shared Move dates dialog to the task side. Tasks aren't filed under
 *  a course, so the whole (already cached) task list is the pool to count from. */
export default function TaskMoveDates({ task, isOpen, onClose }: Props) {
  const shift = useShiftTasks();
  const setDates = useSetTaskDates();
  const respace = useRespaceTasks();
  const { data: rows = [] } = useTasks();

  return (
    <MoveDatesDialog
      target={{
        id: task.id,
        name: task.name,
        dueDate: task.due_date,
        seriesId: task.series_id,
        seriesIndex: task.series_index,
      }}
      rows={rows}
      noun="task"
      shift={(scope, days) => shift.mutateAsync({ taskId: task.id, scope, days })}
      respace={intervalWeeks => respace.mutateAsync({ taskId: task.id, intervalWeeks })}
      restore={items => setDates.mutate(items)}
      isPending={shift.isPending || respace.isPending}
      isError={shift.isError || respace.isError}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
}
