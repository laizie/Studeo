import { Circle, Clock3, CheckCircle2, Pencil, Trash2, Target } from 'lucide-react';
import type { Task, AssignmentStatus } from '../../../shared/types';
import { computeDeadlineLabel, formatDueDate } from '../../../shared/deadlines';
import { useUpdateTask, useDeleteTask } from '../../lib/queries/useTasks';
import { useStudyListStore } from '../../store/useStudyListStore';
import { cn } from '../../lib/utils';

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
  overdue:  'text-red-700 bg-red-100 dark:bg-red-950/70',
  today:    'text-red-700 bg-red-100 dark:bg-red-950/70',
  tomorrow: 'text-orange-700 bg-orange-100 dark:bg-orange-950/70',
  soon:     'text-amber-600 bg-amber-100 dark:bg-amber-950/70',
  week:     'text-green-600 bg-green-100 dark:bg-green-950/70',
  later:    'text-green-700 bg-green-100 dark:bg-green-950/70',
  future:   'text-green-800 bg-green-100 dark:bg-green-950/70',
};

export default function TaskRow({ task, onEdit }: Props) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { items: focusItems, addItem: addToFocus, removeItem: removeFromFocus } = useStudyListStore();
  const inFocusList = focusItems.some(i => i.id === task.id);

  const deadline    = computeDeadlineLabel(task.due_date);
  const isCompleted = task.status === 'completed';

  function handleStatusToggle() {
    updateTask.mutate({ id: task.id, input: { status: nextStatus(task.status) } });
  }

  function handleDelete() {
    if (confirm(`Delete "${task.name}"?`)) deleteTask.mutate(task.id);
  }

  function handleFocusToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (inFocusList) {
      removeFromFocus(task.id);
    } else {
      addToFocus({ id: task.id, type: 'task', name: task.name });
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 group hover:bg-stone-50 dark:hover:bg-[#664433] warm:hover:bg-[#8e6a48] rounded-lg transition-colors">
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

      <span className="shrink-0 text-xs text-stone-500 dark:text-[#c4a882] bg-stone-100 dark:bg-[#664433] warm:bg-[#8e6a48] px-2 py-0.5 rounded hidden md:block">
        {formatDueDate(task.due_date)}
      </span>

      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${isCompleted ? 'text-stone-400 dark:text-[#c4a882] bg-stone-100 dark:bg-[#664433] warm:bg-[#8e6a48]' : URGENCY_CLASS[deadline.urgency]}`}>
        {isCompleted ? 'Done' : deadline.label}
      </span>

      {/* Focus list toggle */}
      <button
        onClick={handleFocusToggle}
        className={cn(
          'shrink-0 p-1 rounded transition-colors',
          inFocusList
            ? 'text-[#e2a53b]'
            : 'opacity-0 group-hover:opacity-100 text-stone-400 dark:text-[#e0b870] hover:text-[#e2a53b]'
        )}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
      >
        <Target size={13} />
      </button>

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
