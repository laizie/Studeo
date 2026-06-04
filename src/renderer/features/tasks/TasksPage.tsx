import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useTasks } from '../../lib/queries/useTasks';
import type { Task } from '../../../shared/types';
import { parseDateLocal } from '../../../shared/deadlines';
import { cn } from '../../lib/utils';
import TaskRow from './TaskRow';
import AddTaskDialog from './AddTaskDialog';

type DueFilter = 'week' | 'month' | 'all';

const FILTERS: { label: string; value: DueFilter }[] = [
  { label: 'This week',  value: 'week'  },
  { label: 'This month', value: 'month' },
  { label: 'All',        value: 'all'   },
];

function getWeekEnd(): Date {
  const today = new Date();
  const day = today.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMon);
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
}

function getMonthEnd(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0); // day 0 of next month = last day of this month
}

function applyFilter(tasks: Task[], filter: DueFilter, showCompleted: boolean): Task[] {
  let result = tasks;

  if (!showCompleted) {
    result = result.filter(t => t.status !== 'completed');
  }

  if (filter === 'week') {
    const end = getWeekEnd();
    result = result.filter(t => parseDateLocal(t.due_date) <= end);
  } else if (filter === 'month') {
    const end = getMonthEnd();
    result = result.filter(t => parseDateLocal(t.due_date) <= end);
  }

  return result;
}

export default function TasksPage() {
  const { data: tasks, isLoading } = useTasks();

  const [filter, setFilter]                   = useState<DueFilter>('all');
  const [showCompleted, setShowCompleted]      = useState(false);
  const [dialogOpen, setDialogOpen]            = useState(false);
  const [editingTask, setEditingTask]          = useState<Task | undefined>();

  const allTasks = tasks ?? [];

  const filtered = useMemo(
    () => applyFilter(allTasks, filter, showCompleted),
    [allTasks, filter, showCompleted]
  );

  function openAdd() {
    setEditingTask(undefined);
    setDialogOpen(true);
  }

  function openEdit(t: Task) {
    setEditingTask(t);
    setDialogOpen(true);
  }

  const completedCount = allTasks.filter(t => t.status === 'completed').length;
  const remainingCount = allTasks.filter(t => t.status !== 'completed').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Tasks</h1>
          <p className="mt-0.5 text-sm text-stone-400">
            {remainingCount > 0
              ? `${remainingCount} remaining`
              : allTasks.length > 0
                ? 'All done'
                : 'No tasks yet'}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
        >
          <Plus size={14} />
          Add task
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg w-fit">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors',
                filter === f.value
                  ? 'bg-white text-stone-800 shadow-sm font-medium'
                  : 'text-stone-500 hover:text-stone-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={e => setShowCompleted(e.target.checked)}
            className="accent-stone-600"
          />
          <span className="text-sm text-stone-500">Show completed</span>
        </label>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-stone-100 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-stone-400 text-sm">
            {allTasks.length === 0
              ? 'No tasks yet.'
              : showCompleted
                ? 'No tasks in this window.'
                : 'No pending tasks in this window.'}
          </p>
          {allTasks.length === 0 && (
            <button
              onClick={openAdd}
              className="mt-3 text-sm text-stone-500 underline hover:text-stone-700 transition-colors"
            >
              Add your first task
            </button>
          )}
          {allTasks.length > 0 && !showCompleted && completedCount > 0 && (
            <button
              onClick={() => setShowCompleted(true)}
              className="mt-2 text-xs text-stone-400 underline hover:text-stone-600 transition-colors"
            >
              Show {completedCount} completed
            </button>
          )}
        </div>
      )}

      {/* Task list */}
      {!isLoading && filtered.length > 0 && (
        <div className="-mx-3">
          {filtered.map(t => (
            <TaskRow key={t.id} task={t} onEdit={openEdit} />
          ))}
        </div>
      )}

      {/* Footer stats */}
      {!isLoading && allTasks.length > 0 && (
        <div className="mt-6 pt-4 border-t border-stone-100 flex gap-4 text-xs text-stone-400">
          <span>{completedCount} completed</span>
          <span>{remainingCount} remaining</span>
          {!showCompleted && completedCount > 0 && (
            <button
              onClick={() => setShowCompleted(true)}
              className="underline hover:text-stone-600 transition-colors"
            >
              + show completed
            </button>
          )}
        </div>
      )}

      <AddTaskDialog
        task={editingTask}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
