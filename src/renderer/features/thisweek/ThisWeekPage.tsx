import { useState, useMemo } from 'react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTasks } from '../../lib/queries/useTasks';
import type { Assignment, Task } from '../../../shared/types';
import { parseDateLocal, dueSortValue } from '../../../shared/deadlines';
import { cn } from '../../lib/utils';
import AssignmentRow from '../courses/AssignmentRow';
import TaskRow from '../tasks/TaskRow';
import AddAssignmentDialog from '../courses/AddAssignmentDialog';
import AddTaskDialog from '../tasks/AddTaskDialog';
import QueryErrorState from '../../components/QueryErrorState';
import { usePageFiltersStore, type ThisWeekWindow } from '../../store/usePageFiltersStore';

// ── Window types + bounds ─────────────────────────────────────────────────────

type Window = ThisWeekWindow;

interface WindowConfig {
  title:    string;
  subtitle: string;
  /** null means no lower bound — overdue items are included. */
  start:    Date | null;
  end:      Date;
}

function getWindowConfig(win: Window): WindowConfig {
  const today = new Date();
  const d = today.getDate();
  const day = today.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), d + diffToMon);

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

  if (win === 'this_week') {
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const sub =
      monday.toLocaleDateString('en-US', opts) + ' – ' +
      sunday.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
    return { title: 'This Week', subtitle: sub, start: null, end: sunday };
  }

  if (win === 'two_weeks') {
    const nextSun = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 13);
    const sub =
      monday.toLocaleDateString('en-US', opts) + ' – ' +
      nextSun.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
    return { title: '2 Weeks', subtitle: sub, start: null, end: nextSun };
  }

  // month
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const sub = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { title: 'This Month', subtitle: sub, start: null, end: endOfMonth };
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(date: Date): string {
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((d.getTime() - todayMid.getTime()) / 86_400_000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${DAY_LABELS[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

const WINDOW_TABS: { label: string; value: Window }[] = [
  { label: 'This week',  value: 'this_week'  },
  { label: '2 weeks',    value: 'two_weeks'  },
  { label: 'This month', value: 'month'      },
];

// ── Unified due-item type ─────────────────────────────────────────────────────

type DueItem =
  | { kind: 'assignment'; data: Assignment }
  | { kind: 'task';       data: Task };

// ── Component ─────────────────────────────────────────────────────────────────

export default function ThisWeekPage() {
  const { data: courses } = useCourses();
  const { data: assignments, isLoading: assignmentsLoading, isError: assignmentsError, refetch: refetchAssignments } = useAssignments();
  const { data: tasks,       isLoading: tasksLoading,       isError: tasksError,       refetch: refetchTasks       } = useTasks();

  const activeWindow        = usePageFiltersStore(s => s.thisWeekWindow);
  const setActiveWindow     = usePageFiltersStore(s => s.setThisWeekWindow);
  const showTasks           = usePageFiltersStore(s => s.thisWeekShowTasks);
  const setShowTasks        = usePageFiltersStore(s => s.setThisWeekShowTasks);

  const [showCompleted, setShowCompleted] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | undefined>();
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  const isLoading = assignmentsLoading || (showTasks && tasksLoading);

  const courseMap = useMemo(
    () => new Map((courses ?? []).map(c => [c.id, c])),
    [courses]
  );

  const windowConfig = useMemo(() => getWindowConfig(activeWindow), [activeWindow]);

  const relevant = useMemo((): DueItem[] => {
    const items: DueItem[] = [];

    for (const a of assignments ?? []) {
      const due = parseDateLocal(a.due_date);
      if (due > windowConfig.end) continue;
      if (windowConfig.start && due < windowConfig.start) continue;
      if (!showCompleted && a.status === 'completed') continue;
      items.push({ kind: 'assignment', data: a });
    }

    if (showTasks) {
      for (const t of tasks ?? []) {
        const due = parseDateLocal(t.due_date);
        if (due > windowConfig.end) continue;
        if (windowConfig.start && due < windowConfig.start) continue;
        if (!showCompleted && t.status === 'completed') continue;
        items.push({ kind: 'task', data: t });
      }
    }

    // Sort by due date, then by time within a day (tasks have no time → all-day).
    return items.sort((a, b) => {
      const av = dueSortValue(a.data.due_date, a.kind === 'assignment' ? a.data.due_time : null);
      const bv = dueSortValue(b.data.due_date, b.kind === 'assignment' ? b.data.due_time : null);
      return av.localeCompare(bv);
    });
  }, [assignments, tasks, windowConfig, showCompleted, showTasks]);

  // Group by display-day label so we can render dividers.
  const grouped = useMemo(() => {
    const map = new Map<string, DueItem[]>();
    for (const item of relevant) {
      const label = dayLabel(parseDateLocal(item.data.due_date));
      const bucket = map.get(label) ?? [];
      if (!map.has(label)) map.set(label, bucket);
      bucket.push(item);
    }
    return map;
  }, [relevant]);

  function openEditAssignment(a: Assignment) {
    setEditingAssignment(a);
    setAssignmentDialogOpen(true);
  }

  function openEditTask(t: Task) {
    setEditingTask(t);
    setTaskDialogOpen(true);
  }

  const completedCount  = relevant.filter(i => i.data.status === 'completed').length;
  const remainingCount  = relevant.filter(i => i.data.status !== 'completed').length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {windowConfig.title}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {windowConfig.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          {/* Tasks toggle */}
          <button
            onClick={() => setShowTasks(!showTasks)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-line bg-inset text-stone-600 dark:text-muted hover:bg-surface-hi transition-colors"
          >
            <span className={cn(
              'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200',
              showTasks ? 'bg-[#7c6abf]' : 'bg-stone-300 dark:bg-surface'
            )}>
              <span className={cn(
                'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200',
                showTasks ? 'translate-x-3.5' : 'translate-x-0.5'
              )} />
            </span>
            Tasks
          </button>
          {/* Show completed */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={e => setShowCompleted(e.target.checked)}
              className="accent-stone-600"
            />
            <span className="text-sm text-muted">Show completed</span>
          </label>
        </div>
      </div>

      {/* Window tab switcher */}
      <div className="flex items-center gap-1 p-1 bg-inset rounded-lg w-fit mb-6">
        {WINDOW_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setActiveWindow(t.value)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              activeWindow === t.value
                ? 'bg-surface text-ink shadow-sm font-medium'
                : ' text-stone-600 dark:text-muted hover:bg-stone-200 dark:hover:bg-surface-hi'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error — must never render as the empty state */}
      {(assignmentsError || (showTasks && tasksError)) && (
        <QueryErrorState
          title="Couldn't load this week"
          onRetry={() => { refetchAssignments(); refetchTasks(); }}
        />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !assignmentsError && !(showTasks && tasksError) && relevant.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-stone-500 text-sm">
            {showCompleted
              ? `Nothing due ${windowConfig.title.toLowerCase()}.`
              : `Nothing due ${windowConfig.title.toLowerCase()} — or everything is done.`}
          </p>
          {!showCompleted && (
            <button
              onClick={() => setShowCompleted(true)}
              className="mt-2 text-xs text-muted underline hover:text-stone-600 transition-colors"
            >
              Show completed
            </button>
          )}
        </div>
      )}

      {/* Grouped rows */}
      {!isLoading && relevant.length > 0 && (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([label, items]) => (
            <div key={label} className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
              <div className={cn(
                'px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b border-line bg-stone-50 dark:bg-surface-hi',
                label === 'Overdue' ? 'text-red-400' : 'text-muted'
              )}>
                {label}
              </div>
              <div className="divide-y divide-line">
                {items.map(item =>
                  item.kind === 'assignment' ? (
                    <AssignmentRow
                      key={`a-${item.data.id}`}
                      assignment={item.data}
                      onEdit={openEditAssignment}
                      course={courseMap.get(item.data.course_id)}
                    />
                  ) : (
                    <TaskRow
                      key={`t-${item.data.id}`}
                      task={item.data}
                      onEdit={openEditTask}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats footer */}
      {!isLoading && relevant.length > 0 && (
        <div className="mt-6 pt-4 border-t border-line flex gap-4 text-xs text-muted">
          <span>{completedCount} completed</span>
          <span>{remainingCount} remaining</span>
          {!showCompleted && (
            <button
              onClick={() => setShowCompleted(true)}
              className="underline hover:text-stone-600 transition-colors"
            >
              + show completed
            </button>
          )}
        </div>
      )}

      <AddAssignmentDialog
        courseId={editingAssignment?.course_id ?? ''}
        assignment={editingAssignment}
        isOpen={assignmentDialogOpen}
        onClose={() => setAssignmentDialogOpen(false)}
      />
      <AddTaskDialog
        task={editingTask}
        isOpen={taskDialogOpen}
        onClose={() => setTaskDialogOpen(false)}
      />
    </div>
  );
}
