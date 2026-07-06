import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Target, AlertTriangle } from 'lucide-react';
import QueryErrorState from '../../components/QueryErrorState';
import { useStudyListStore } from '../../store/useStudyListStore';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTasks } from '../../lib/queries/useTasks';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useTerms } from '../../lib/queries/useTerms';
import { useStudySessions } from '../../lib/queries/useStudySessions';
import { usePageFiltersStore } from '../../store/usePageFiltersStore';
import type { Assignment, Course, ClassMeeting, Task } from '../../../shared/types';
import { parseDateLocal, computeDeadlineLabel, dueSortValue, formatDueDate } from '../../../shared/deadlines';
import { localDayKey } from '../../../shared/studyStats';
import { useRescheduleItems } from '../../lib/queries/useRescheduleItems';
import { URGENCY_CLASS } from '../../lib/urgency';
import { cn } from '../../lib/utils';
import CourseDialog from '../courses/CourseDialog';
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
        urgent ? 'text-red-700' : 'text-stone-500',
      )}>
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded-full font-medium',
          urgent ? 'bg-red-100 dark:bg-red-950 text-red-700' : 'bg-surface text-stone-600 dark:text-muted',
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
          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-ink hover:bg-accent-deep transition-colors disabled:opacity-60"
        >
          {pending ? 'Moving…' : `Move → ${formatDueDate(date)}`}
        </button>
      </div>
    </div>
  );
}

function AssignmentItem({ assignment, course, selectable, selected, onToggleSelect }: {
  assignment: Assignment;
  course: Course | undefined;
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
        // z-10 lifts the checkbox above the stretched-link ::after overlay so it
        // stays clickable (the row otherwise navigates to the course).
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect?.(assignment.id)}
          aria-label={`Select ${assignment.name}`}
          className="relative z-10 shrink-0 h-4 w-4 accent-stone-600 cursor-pointer"
        />
      )}
      {course && (
        <span
          className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${course.color}40`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      )}
      {/* Stretched link: the whole row navigates, but the link stays a sibling of the
          star button — no interactive element nested inside another (valid + a11y). */}
      <Link
        to={course ? `/courses/${course.id}` : '#'}
        className="flex-1 min-w-0 truncate text-sm text-ink-soft rounded-sm after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted"
      >
        {assignment.name}
      </Link>
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
            : 'text-stone-500 hover:text-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        <Target size={13} />
      </button>
    </div>
  );
}

function TaskItem({ task }: { task: Task }) {
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
      <div className="w-1 h-5 rounded-full shrink-0 bg-[#7c6abf]" />
      <Link
        to="/tasks"
        className="flex-1 min-w-0 truncate text-sm text-ink-soft rounded-sm after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 dark:focus-visible:ring-muted"
      >
        {task.name}
      </Link>
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
            : 'text-stone-500 hover:text-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        <Target size={13} />
      </button>
    </div>
  );
}

function ClassItem({ meeting, course }: { meeting: ClassMeeting; course: Course | undefined }) {
  return (
    <Link
      to={course ? `/courses/${course.id}` : '#'}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hi transition-colors"
    >
      {course ? (
        <span
          className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${course.color}40`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-stone-500 font-medium">?</span>
      )}
      <span className="text-sm text-ink-soft flex-1 truncate">
        {course?.name ?? 'Unknown'}
      </span>
      <span className="text-xs text-muted shrink-0">{formatTime(meeting.start_time)}</span>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const termFilter            = usePageFiltersStore(s => s.termFilter);
  const setTermFilter         = usePageFiltersStore(s => s.setTermFilter);
  const termFilterInitialized = usePageFiltersStore(s => s.termFilterInitialized);
  const initTermFilter        = usePageFiltersStore(s => s.initTermFilter);

  // Auto-select the term whose date range contains today, once terms load.
  // One-time (guarded by termFilterInitialized): re-running on every null would
  // snap the dropdown back when the user explicitly picks "All semesters".
  useEffect(() => {
    if (termFilterInitialized || terms.length === 0) return;
    const today = localDayKey(new Date()); // local date — toISOString() is UTC and drifts a day in the evening
    const current = terms.find(t =>
      t.start_date && t.end_date && t.start_date <= today && today <= t.end_date
    );
    initTermFilter(current?.id ?? null);
  }, [terms, termFilterInitialized, initTermFilter]);

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
    reschedule.mutate(
      {
        items: [...selectedOverdue].map(id => ({ kind: 'assignment' as const, id })),
        dueDate: rescheduleDate,
      },
      { onSuccess: () => setSelectedOverdue(new Set()) },
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

  const pendingTasks = useMemo(() =>
    allTasks
      .filter(t => t.status !== 'completed')
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [allTasks],
  );

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
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep transition-colors"
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

      {/* ── No courses empty state ───────────────────────────────────────────── */}
      {!hasCourses && (
        <div className="text-center py-24">
          <p className="text-stone-500 text-sm">No courses yet. Add your first one to get started.</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-3 text-sm text-muted underline hover:text-stone-700 transition-colors"
          >
            Add course
          </button>
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

          {/* ── Overdue alert (only when something is actually overdue) ───── */}
          {overdue.length > 0 && (
            <div className="flex items-center gap-2.5 w-fit mb-8 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="text-sm font-medium">
                <span className="font-semibold tabular-nums">{overdue.length}</span>{' '}
                {overdue.length === 1 ? 'assignment' : 'assignments'} overdue
              </span>
            </div>
          )}

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
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div>
                <SectionLabel title="Tasks" count={pendingTasks.length} />
                {pendingTasks.length === 0 ? (
                  <p className="px-3 text-sm text-muted">No pending tasks.</p>
                ) : (
                  <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-line">
                      {pendingTasks.map(t => (
                        <TaskItem key={t.id} task={t} />
                      ))}
                    </div>
                  </div>
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
    </div>
  );
}
