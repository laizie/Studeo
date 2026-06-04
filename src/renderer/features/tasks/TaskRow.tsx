import { Circle, Clock3, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import type { Task, AssignmentStatus } from '../../../shared/types';
import { computeDeadlineLabel, formatDueDate } from '../../../shared/deadlines';
import { useUpdateTask, useDeleteTask } from '../../lib/queries/useTasks';

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
}

const STATUS_CYCLE: AssignmentStatus[] = ['not_started', 'in_progress', 'completed'];

function nextStatus(current: AssignmentStatus): AssignmentStatus {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
}

function StatusIcon({ status }: { status: AssignmentStatus }) {
  if (status === 'completed')   return <CheckCircle2 size={17} className="text-green-500" />;
  if (status === 'in_progress') return <Clock3       size={17} className="text-blue-400"  />;
  return                               <Circle       size={17} className="text-stone-300" />;
}

const URGENCY_CLASS: Record<string, string> = {
  overdue:  'text-red-500',
  today:    'text-amber-500',
  soon:     'text-amber-400',
  upcoming: 'text-stone-400',
};

export default function TaskRow({ task, onEdit }: Props) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const deadline    = computeDeadlineLabel(task.due_date);
  const isCompleted = task.status === 'completed';

  function handleStatusToggle() {
    updateTask.mutate({ id: task.id, input: { status: nextStatus(task.status) } });
  }

  function handleDelete() {
    if (confirm(`Delete "${task.name}"?`)) deleteTask.mutate(task.id);
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 group hover:bg-stone-50 dark:hover:bg-[#664433] rounded-lg transition-colors">
      <button
        onClick={handleStatusToggle}
        disabled={updateTask.isPending}
        className="shrink-0 hover:scale-110 transition-transform disabled:opacity-50"
        title={`Status: ${task.status} — click to advance`}
      >
        <StatusIcon status={task.status} />
      </button>

      <span className={`flex-1 text-sm truncate ${isCompleted ? 'line-through text-stone-400 dark:text-[#cc9a58]' : 'text-stone-800 dark:text-[#f0e0cc]'}`}>
        {task.name}
      </span>

      <span className="shrink-0 text-xs text-stone-400 dark:text-[#e0b870] w-14 text-right hidden md:block">
        {formatDueDate(task.due_date)}
      </span>

      <span className={`shrink-0 text-xs font-medium w-20 text-right ${isCompleted ? 'text-stone-300' : URGENCY_CLASS[deadline.urgency]}`}>
        {isCompleted ? 'Done' : deadline.label}
      </span>

      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(task)}
          className="p-1 text-stone-400 dark:text-[#e0b870] hover:text-stone-600 dark:hover:text-[#d4b896] rounded transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteTask.isPending}
          className="p-1 text-stone-400 hover:text-red-500 rounded transition-colors disabled:opacity-50"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
