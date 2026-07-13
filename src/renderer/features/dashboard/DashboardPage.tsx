import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Target, GraduationCap } from 'lucide-react';
import QueryErrorState from '../../components/QueryErrorState';
import { useStudyListStore } from '../../store/useStudyListStore';
import { showUndoToast } from '../../store/useToastStore';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTasks } from '../../lib/queries/useTasks';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useTerms } from '../../lib/queries/useTerms';
import { useStudySessions } from '../../lib/queries/useStudySessions';
import { useTermFilter } from '../../lib/useTermFilter';
import type { Assignment, Course, ClassMeeting, Task } from '../../../shared/types';
import { parseDateLocal, computeDeadlineLabel, dueSortValue, formatDueDate } from '../../../shared/deadlines';
import { localDayKey } from '../../../shared/studyStats';
import { useRescheduleItems } from '../../lib/queries/useRescheduleItems';
import { URGENCY_CLASS } from '../../lib/urgency';
import { cn } from '../../lib/utils';
import CourseDialog from '../courses/CourseDialog';
import AddAssignmentDialog from '../courses/AddAssignmentDialog';
import AddTaskDialog from '../tasks/AddTaskDialog';
import SemesterTimelineStrip from './SemesterTimelineStrip';

// ── Helpers ───────────────────────────────────────────────────────────────────

function greetingText(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function getWeekEnd(): Date {
  const today = new Date();
  const day = today.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMon);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
}

/** A YYYY-MM-DD key `offsetDays` from today, built from local date parts (DST-safe). */
function dayKeyFromToday(offsetDays: number): string {
  const d = new Date();
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays));
}

/** The *next* Monday's key — always ≥1 day out, so it never resolves to today. */
function nextMondayKey(): string {
  const dow = new Date().getDay(); // 0=Sun … 6=Sat
  return dayKeyFromToday(((8 - dow) % 7) || 7);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ title, count, urgent }: {
  title: string;
  count?: number;
  urgent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 px-3">
      <h2 className={cn(
        'text-xs font-semibold uppercase tracking-wide',
        urgent ? 'text-red-700' : 'text-muted',
      )}>
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded-full font-medium',
          urgent ? 'bg-red-100 dark:bg-red-950 text-red-700' : 'bg-surface text-muted',
        )}>
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * Batch-reschedule bar for Overdue triage. Appears once ≥1 overdue assignment is
 * selected; picks a target date (presets or a native date field) and moves the
 * whole selection at once — far less friction than editing each item's dialog.
 */
function RescheduleBar({ count, date, onDateChange, onApply, onClear, pending }: {
  count: number;
  date: string;
  onDateChange: (key: string) => void;
  onApply: () => void;
  onClear: () => void;
  pending: boolean;
}) {
  const presets: { label: string; key: string }[] = [
    { label: 'Today',    key: dayKeyFromToday(0) },
    { label: 'Tomorrow', key: dayKeyFromToday(1) },
    { label: 'Next Mon', key: nextMondayKey() },
  ];
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-line">
      <span className="text-sm font-medium text-ink tabular-nums">{count} selected</span>
      <span className="text-xs text-muted">Move to</span>
      {presets.map(p => (
        <button
          key={p.label}
          onClick={() => onDateChange(p.key)}
          className={cn(
            'px-2 py-0.5 text-xs rounded-md border transition-colors',
            date === p.key
              ? 'bg-accent text-accent-ink border-transparent'
              : 'border-line text-muted hover:text-ink hover:border-stone-300 dark:hover:border-stone-600',
          )}
        >
          {p.label}
        </button>
      ))}
      <input
        type="date"
        value={date}
        onChange={e => e.target.value && onDateChange(e.target.value)}
        aria-label="Reschedule to date"
        className="px-2 py-0.5 text-xs rounded-md border border-line bg-bg text-ink"
      />
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={onClear}
          className="px-2 py-1 text-xs text-muted hover:text-ink transition-colors"
        >
          Clear
        </button>
        <button
          onClick={onApply}
          disabled={pending}
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-ink hover:bg-accent-deep active:scale-[0.98] transition-colors disabled:opacity-60"
        >
          {pending ? 'Moving…' : `Move → ${formatDueDate(date)}`}
        </button>
      </div>
    </div>
  );
}

function AssignmentItem({ assignment, course, onEdit, selectable, selected, onToggleSelect }: {
  assignment: Assignment;
  course: Course | undefined;
  onEdit: (a: Assignment) => void;
  /** When true, show a leading checkbox for batch actions (e.g. Overdue triage). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const deadline = computeDeadlineLabel(assignment.due_date);
  const { items: focusItems, addItem: addToFocus, removeItem: removeFromFocus } = useStudyListStore();
  const inFocusList = focusItems.some(i => i.id === assignment.id);

  function handleFocusToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inFocusList) {
      removeFromFocus(assignment.id);
    } else {
      addToFocus({
        id: assignment.id,
        type: 'assignment',
        name: assignment.name,
        courseName: course?.abbreviation || course?.name,
        courseColor: course?.color,
      });
    }
  }

  return (
    <div className="group relative flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors">
      {selectable && (
        // z-10 lifts the checkbox above the stretched edit-button's ::after
        // overlay so it stays clickable (the row otherwise opens the editor).
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect?.(assignment.id)}
          aria-label={`Select ${assignment.name}`}
          className="relative z-10 shrink-0 h-4 w-4 accent-stone-600 cursor-pointer"
        />
      )}
      {/* Badge → course; the course jump keeps its own visible target. z-10
          lifts it above the stretched edit button's ::after overlay. */}
      {course && (
        <Link
          to={`/courses/${course.id}`}
          title={`Open ${course.name}`}
          className="relative z-10 shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          style={{ backgroundColor: `${course.color}40`, color: course.color }}
        >
          {course.abbreviation}
        </Link>
      )}
      {/* Stretched button: the whole row opens the edit dialog (same row model
          as This Week and the course page), and it stays a sibling of the star
          button — no interactive element nested inside another. */}
      <button
        type="button"
        onClick={() => onEdit(assignment)}
        className="flex-1 min-w-0 truncate text-left text-sm text-ink-soft rounded-sm after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted"
      >
        {assignment.name}
      </button>
      <span className={cn('text-xs font-medium shrink-0 px-2 py-0.5 rounded', URGENCY_CLASS[deadline.urgency])}>
        {deadline.label}
      </span>
      <button
        onClick={handleFocusToggle}
        aria-pressed={inFocusList}
        aria-label={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        className={cn(
          'relative shrink-0 p-1 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          inFocusList
            ? 'text-accent opacity-100'
            : 'text-muted hover:text-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        <Target size={13} />
      </button>
    </div>
  );
}

function TaskItem({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const deadline = computeDeadlineLabel(task.due_date);
  const { items: focusItems, addItem: addToFocus, removeItem: removeFromFocus } = useStudyListStore();
  const inFocusList = focusItems.some(i => i.id === task.id);

  function handleFocusToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inFocusList) {
      removeFromFocus(task.id);
    } else {
      addToFocus({ id: task.id, type: 'task', name: task.name });
    }
  }

  return (
    <div className="group relative flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors">
      <div className="w-1 h-5 rounded-full shrink-0 bg-task" />
      {/* Row edits in place — no detour through the Tasks page to re-find it. */}
      <button
        type="button"
        onClick={() => onEdit(task)}
        className="flex-1 min-w-0 truncate text-left text-sm text-ink-soft rounded-sm after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted"
      >
        {task.name}
      </button>
      <span className={cn('text-xs font-medium shrink-0 px-2 py-0.5 rounded', URGENCY_CLASS[deadline.urgency])}>
        {deadline.label}
      </span>
      <button
        onClick={handleFocusToggle}
        aria-pressed={inFocusList}
        aria-label={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
        className={cn(
          'relative shrink-0 p-1 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          inFocusList
            ? 'text-accent opacity-100'
            : 'text-muted hover:text-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        <Target size={13} />
      </button>
    </div>
  );
}

function ClassItem({ meeting, course }: { meeting: ClassMeeting; course: Course | undefined }) {
  const row = (
    <>
      {course ? (
        <span
          className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${course.color}40`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-muted font-medium">?</span>
      )}
      <span className="text-sm text-ink-soft flex-1 truncate">
        {course?.name ?? 'Unknown'}
      </span>
      <span className="text-xs text-muted shrink-0">{formatTime(meeting.start_time)}</span>
    </>
  );

  // An orphaned meeting (course lookup missed) is plain text, not a dead link.
  if (!course) {
    return <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">{row}</div>;
  }
  return (
    <Link
      to={`/courses/${course.id}`}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors"
    >
      {row}
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  // Row-click editing (the app-wide row model): which item is being edited.
  const [editingAssignment, setEditingAssignment] = useState<Assignment | undefined>();
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  function openEditAssignment(a: Assignment) {
    setEditingAssignment(a);
    setAssignmentDialogOpen(true);
  }
  function openEditTask(t: Task) {
    setEditingTask(t);
    setTaskDialogOpen(true);
  }

  const { data: courses,     isLoading: coursesLoading,     isError: coursesError,     refetch: refetchCourses     } = useCourses();
  const { data: assignments, isLoading: assignmentsLoading, isError: assignmentsError, refetch: refetchAssignments } = useAssignments();
  const { data: tasks  } = useTasks();
  const { data: meetings } = useClassMeetings();
  const { data: terms = [] } = useTerms();
  const { data: studySessions } = useStudySessions();

  // One quiet line, not a metric tile: total focus time over the last 7 days.
  const focusedThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    const secs = (studySessions ?? [])
      .filter(s => s.kind === 'focus' && new Date(s.started_at).getTime() >= cutoff)
      .reduce((sum, s) => sum + s.duration_seconds, 0);
    if (secs < 60) return null;
    return secs >= 3600 ? `${(secs / 3600).toFixed(1)} hrs` : `${Math.round(secs / 60)} min`;
  }, [studySessions]);

  const { termFilter, setTermFilter } = useTermFilter();

  const isLoading = coursesLoading || assignmentsLoading;

  const allCourses = useMemo(() =>
    (courses ?? []).filter(c => termFilter === null || c.term_id === termFilter),
    [courses, termFilter],
  );

  const courseIds = useMemo(() => new Set(allCourses.map(c => c.id)), [allCourses]);

  const courseMap = useMemo(
    () => new Map(allCourses.map(c => [c.id, c])),
    [allCourses],
  );

  const todayMidnight = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const weekEnd    = useMemo(() => getWeekEnd(), []);
  const todayDow   = new Date().getDay();

  const allAssignments = useMemo(() =>
    (assignments ?? []).filter(a => courseIds.has(a.course_id)),
    [assignments, courseIds],
  );
  const allTasks    = tasks    ?? [];
  const allMeetings = useMemo(() =>
    (meetings ?? []).filter(m => courseIds.has(m.course_id)),
    [meetings, courseIds],
  );

  const overdue = useMemo(() =>
    allAssignments
      .filter(a => parseDateLocal(a.due_date) < todayMidnight && a.status !== 'completed')
      .sort((a, b) => dueSortValue(a.due_date, a.due_time).localeCompare(dueSortValue(b.due_date, b.due_time))),
    [allAssignments, todayMidnight],
  );

  // ── Overdue triage: tick rows, reschedule the whole batch to one date ──────────
  const reschedule = useRescheduleItems();
  const [selectedOverdue, setSelectedOverdue] = useState<Set<string>>(() => new Set());
  const [rescheduleDate, setRescheduleDate] = useState(() => localDayKey(new Date()));

  // Prune ids that are no longer overdue (rescheduled, completed, or filtered out by
  // a term switch) so the count and the batch action never act on stale rows.
  useEffect(() => {
    setSelectedOverdue(prev => {
      if (prev.size === 0) return prev;
      const live = new Set(overdue.map(a => a.id));
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [overdue]);

  function toggleOverdue(id: string) {
    setSelectedOverdue(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyReschedule() {
    if (selectedOverdue.size === 0) return;
    // Remember each row's old date before the move — Undo restores them
    // individually (they were overdue on different days).
    const moved = overdue.filter(a => selectedOverdue.has(a.id));
    const prior = moved.map(a => ({ kind: 'assignment' as const, id: a.id, dueDate: a.due_date }));
    reschedule.mutate(
      {
        items: moved.map(a => ({ kind: 'assignment' as const, id: a.id })),
        dueDate: rescheduleDate,
      },
      {
        onSuccess: () => {
          setSelectedOverdue(new Set());
          showUndoToast(
            `Moved ${moved.length} to ${formatDueDate(rescheduleDate)}`,
            () => reschedule.mutate({ items: prior, dueDate: rescheduleDate }),
          );
        },
      },
    );
  }

  const dueThisWeek = useMemo(() =>
    allAssignments
      .filter(a => {
        const d = parseDateLocal(a.due_date);
        return d >= todayMidnight && d <= weekEnd && a.status !== 'completed';
      })
      .sort((a, b) => dueSortValue(a.due_date, a.due_time).localeCompare(dueSortValue(b.due_date, b.due_time))),
    [allAssignments, todayMidnight, weekEnd],
  );

  const todayClasses = useMemo(() =>
    allMeetings
      .filter(m => m.day_of_week === todayDow)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [allMeetings, todayDow],
  );

  // Tasks are windowed like assignments: the dashboard shows this week only
  // (overdue included), with a count link to the rest — an unbounded list here
  // could push "Due this week" off screen.
  const pendingTasks = useMemo(() =>
    allTasks
      .filter(t => t.status !== 'completed')
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [allTasks],
  );
  const tasksThisWeek = useMemo(() =>
    pendingTasks.filter(t => parseDateLocal(t.due_date) <= weekEnd),
    [pendingTasks, weekEnd],
  );
  const laterTasksCount = pendingTasks.length - tasksThisWeek.length;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    // Skeleton mirrors the loaded layout (header + 1fr/240px grid, no stat row)
    // so content doesn't shift on arrival. Theme-aware so it doesn't flash light.
    const block = 'bg-surface rounded-xl';
    return (
      <div className="p-8 animate-pulse">
        <div className="flex items-start justify-between mb-8">
          <div className="space-y-2">
            <div className={cn('h-7 w-44', block)} />
            <div className={cn('h-4 w-32', block)} />
          </div>
          <div className={cn('h-9 w-28', block)} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-x-8 gap-y-8">
          <div className="space-y-8">
            <div className={cn('h-48', block)} />
            <div className={cn('h-32', block)} />
          </div>
          <div className="space-y-8">
            <div className={cn('h-32', block)} />
            <div className={cn('h-40', block)} />
          </div>
        </div>
      </div>
    );
  }

  // ── Error ── A failed load must never look like an empty account ("No courses yet").
  if (coursesError || assignmentsError) {
    return (
      <div className="p-8">
        <QueryErrorState
          title="Couldn't load your dashboard"
          message="Your courses and assignments are saved on this device — this is usually a brief hiccup."
          onRetry={() => { refetchCourses(); refetchAssignments(); }}
        />
      </div>
    );
  }

  const hasCourses = allCourses.length > 0;
  const selectedTerm = terms.find(t => t.id === termFilter);

  return (
    <div className="p-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{greetingText()}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {todayLabel()}
            {focusedThisWeek && <> · {focusedThisWeek} focused this week</>}
            {/* Weekend nudge — the Weekly Review's seasonal front door */}
            {[0, 6].includes(new Date().getDay()) && (
              <>
                {' · '}
                <Link to="/review" className="underline hover:text-ink transition-colors">
                  Review your week →
                </Link>
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] transition-colors"
        >
          <Plus size={15} />
          Add course
        </button>
      </div>

      {/* Semester filter */}
      {terms.length > 0 && (
        <div className="mb-8">
          <select
            value={termFilter ?? ''}
            onChange={e => setTermFilter(e.target.value || null)}
            className="px-3 py-1.5 text-sm rounded-lg border border-line bg-surface text-ink-soft focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-surface-hi cursor-pointer"
          >
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="">All semesters</option>
          </select>
        </div>
      )}

      {/* ── No courses empty state ───────────────────────────────────────────────
           Day one is the make-or-break session for this app, and the Dashboard is
           where a new student lands. It used to offer only "Add course" — one
           course, one dialog — while the four-step semester wizard (courses, class
           times, syllabus import) sat invisible on the Courses page. Same offer as
           CoursesPage now: the wizard first, a single course as the side door. */}
      {!hasCourses && (
        <div className="text-center py-24">
          <p className="text-muted text-sm">
            Nothing here yet. Set up your semester and this becomes your home base.
          </p>
          <Link
            to="/setup"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] transition-colors"
          >
            <GraduationCap size={15} />
            Set up a semester
          </Link>
          <div>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-3 text-sm text-muted underline hover:text-ink transition-colors"
            >
              Or add a single course
            </button>
          </div>
        </div>
      )}

      {hasCourses && (
        <>
          {/* ── Semester timeline: every course across the term, exam/project
               markers, and the per-week pileup. Self-hides unless the selected
               term has start/end dates. ──────────────────────────────────── */}
          <SemesterTimelineStrip
            term={selectedTerm}
            courses={allCourses}
            assignments={allAssignments}
          />

          {/* One red signal for overdue: the section header below carries it.
              The old banner stacked a third treatment on the same fact —
              "color reinforces the word," it doesn't repeat it. */}

          {/* ── Content grid ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-x-8 gap-y-8">

            {/* Left: overdue + due this week */}
            <div className="space-y-8">

              {overdue.length > 0 && (
                <div>
                  <SectionLabel title="Overdue" count={overdue.length} urgent />
                  {selectedOverdue.size > 0 && (
                    <RescheduleBar
                      count={selectedOverdue.size}
                      date={rescheduleDate}
                      onDateChange={setRescheduleDate}
                      onApply={applyReschedule}
                      onClear={() => setSelectedOverdue(new Set())}
                      pending={reschedule.isPending}
                    />
                  )}
                  <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-line">
                      {overdue.map(a => (
                        <AssignmentItem
                          key={a.id}
                          assignment={a}
                          course={courseMap.get(a.course_id)}
                          onEdit={openEditAssignment}
                          selectable
                          selected={selectedOverdue.has(a.id)}
                          onToggleSelect={toggleOverdue}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <SectionLabel title="Due this week" count={dueThisWeek.length} />
                {dueThisWeek.length === 0 ? (
                  <p className="px-3 text-sm text-muted">
                    {allAssignments.length === 0
                      ? 'Add assignments to a course to see them here.'
                      : 'Nothing due this week — enjoy the break!'}
                  </p>
                ) : (
                  <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-line">
                      {dueThisWeek.map(a => (
                        <AssignmentItem
                          key={a.id}
                          assignment={a}
                          course={courseMap.get(a.course_id)}
                          onEdit={openEditAssignment}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tasks — this week's only; the rest live on the Tasks page */}
              <div>
                <SectionLabel title="Tasks" count={tasksThisWeek.length} />
                {tasksThisWeek.length === 0 ? (
                  <p className="px-3 text-sm text-muted">
                    {laterTasksCount > 0
                      ? <>Nothing due this week. <Link to="/tasks" className="underline hover:text-ink transition-colors">{laterTasksCount} later →</Link></>
                      : 'No pending tasks.'}
                  </p>
                ) : (
                  <>
                    <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
                      <div className="divide-y divide-line">
                        {tasksThisWeek.map(t => (
                          <TaskItem key={t.id} task={t} onEdit={openEditTask} />
                        ))}
                      </div>
                    </div>
                    {laterTasksCount > 0 && (
                      <Link
                        to="/tasks"
                        className="mt-2 inline-block px-3 text-xs text-muted underline hover:text-ink transition-colors"
                      >
                        {laterTasksCount} more in Tasks →
                      </Link>
                    )}
                  </>
                )}
              </div>

            </div>

            {/* Right: today's classes + courses */}
            <div className="space-y-8">

              <div>
                <SectionLabel title="Today's classes" />
                {todayClasses.length === 0 ? (
                  <p className="px-3 text-sm text-muted">No classes today.</p>
                ) : (
                  <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-line">
                      {todayClasses.map(m => (
                        <ClassItem
                          key={m.id}
                          meeting={m}
                          course={courseMap.get(m.course_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <SectionLabel title="Courses" />
                <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
                  <div className="divide-y divide-line">
                    {allCourses.map(c => {
                      const ca = allAssignments.filter(a => a.course_id === c.id);
                      const done  = ca.filter(a => a.status === 'completed').length;
                      const total = ca.length;
                      return (
                        <Link
                          key={c.id}
                          to={`/courses/${c.id}`}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-hi transition-colors group"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="text-sm text-ink-soft flex-1 truncate group-hover:text-stone-900 dark:group-hover:text-white">
                            {c.name}
                          </span>
                          {total > 0 && (
                            <span className="text-xs text-muted shrink-0 tabular-nums">
                              {done}/{total}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      <CourseDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
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
