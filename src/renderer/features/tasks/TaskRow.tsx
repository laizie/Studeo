import { useState } from 'react';
import { Circle, CheckCircle2, Pencil, Trash2, Target } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { Task, AssignmentStatus } from '../../../shared/types';
import { computeDeadlineLabel, formatDueDate } from '../../../shared/deadlines';
import { useUpdateTask, useDeleteTask } from '../../lib/queries/useTasks';
import { useStudyListStore } from '../../store/useStudyListStore';
import { showUndoToast } from '../../store/useToastStore';
import { URGENCY_CLASS } from '../../lib/urgency';
import { cn } from '../../lib/utils';

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
}

// Status is a simple done / not-done toggle (PRD §11, resolved June 2026).
function StatusIcon({ status }: { status: AssignmentStatus }) {
  return status === 'completed'
    ? <CheckCircle2 size={17} className="text-green-500" />
    : <Circle       size={17} className="text-muted" />;
}

export default function TaskRow({ task, onEdit }: Props) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { items: focusItems, addItem: addToFocus, removeItem: removeFromFocus } = useStudyListStore();
  const inFocusList = focusItems.some(i => i.id === task.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deadline    = computeDeadlineLabel(task.due_date);
  const isCompleted = task.status === 'completed';

  function handleStatusToggle() {
    const next = isCompleted ? 'not_started' : 'completed';
    updateTask.mutate(
      { id: task.id, input: { status: next } },
      {
        onSuccess: () => {
          if (next !== 'completed') return;
          showUndoToast(`Marked “${task.name}” done`, () =>
            updateTask.mutate({ id: task.id, input: { status: 'not_started' } }),
          );
        },
      },
    );
  }

  function handleDelete() {
    setConfirmOpen(true);
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
    <div>
    {/* Row click edits (matches AssignmentRow); the pencil is the keyboard path. */}
    <div
      onClick={() => onEdit(task)}
      className="flex items-center gap-3 px-3 py-2.5 group hover:bg-surface-hi rounded-lg transition-colors cursor-pointer"
    >
      <button
        onClick={(e) => { e.stopPropagation(); handleStatusToggle(); }}
        disabled={updateTask.isPending}
        aria-pressed={isCompleted}
        className="shrink-0 hover:scale-110 transition-transform disabled:opacity-50 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
        title={isCompleted ? 'Mark as not done' : 'Mark as done'}
        aria-label={isCompleted ? `Mark ${task.name} as not done` : `Mark ${task.name} as done`}
      >
        <StatusIcon status={task.status} />
      </button>

      <span className={`flex-1 text-sm truncate ${isCompleted ? 'line-through text-muted' : 'text-ink'}`}>
        {task.name}
      </span>

      <span className="shrink-0 text-xs text-muted bg-inset px-2 py-0.5 rounded hidden md:block">
        {formatDueDate(task.due_date)}
      </span>

      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${isCompleted ? 'text-muted bg-inset' : URGENCY_CLASS[deadline.urgency]}`}>
        {isCompleted ? 'Done' : deadline.label}
      </span>

      {/* Focus list toggle */}
      <button
        onClick={handleFocusToggle}
        aria-pressed={inFocusList}
        aria-label={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        className={cn(
          'shrink-0 p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          inFocusList
            ? 'text-accent'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-muted hover:text-accent'
        )}
      >
        <Target size={13} />
      </button>

      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(task); }}
          aria-label={`Edit ${task.name}`}
          className="p-1 text-muted hover:text-ink-soft rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          disabled={deleteTask.isPending}
          aria-label={`Delete ${task.name}`}
          className="p-1 text-muted hover:text-red-500 rounded transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>

    </div>

    {/* Outside the clickable row so dialog clicks don't bubble into it. */}
    <ConfirmDialog
      isOpen={confirmOpen}
      title={`Delete "${task.name}"?`}
      onConfirm={() => deleteTask.mutate(task.id)}
      onClose={() => setConfirmOpen(false)}
    />
    </div>
  );
}
