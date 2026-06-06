import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Target } from 'lucide-react';
import { useStudyListStore } from '../../store/useStudyListStore';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTasks } from '../../lib/queries/useTasks';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useTerms } from '../../lib/queries/useTerms';
import { usePageFiltersStore } from '../../store/usePageFiltersStore';
import type { Assignment, Course, ClassMeeting, Task } from '../../../shared/types';
import { parseDateLocal, computeDeadlineLabel } from '../../../shared/deadlines';
import { cn } from '../../lib/utils';
import CreateCourseDialog from '../courses/CreateCourseDialog';

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

const URGENCY_CLASS: Record<string, string> = {
  overdue:  'text-red-700 bg-red-100 dark:bg-red-950/70',
  today:    'text-red-700 bg-red-100 dark:bg-red-950/70',
  tomorrow: 'text-orange-700 bg-orange-100 dark:bg-orange-950/70',
  soon:     'text-amber-600 bg-amber-100 dark:bg-amber-950/70',
  week:     'text-green-600 bg-green-100 dark:bg-green-950/70',
  later:    'text-green-700 bg-green-100 dark:bg-green-950/70',
  future:   'text-green-800 bg-green-100 dark:bg-green-950/70',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, urgent }: {
  label: string;
  value: string | number;
  urgent?: boolean;
}) {
  const isUrgent = urgent && (value as number) > 0;
  return (
    <div className={cn(
      'flex-1 min-w-[130px] max-w-[200px] rounded-xl px-4 py-3 border shadow-sm',
      isUrgent ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900' : 'bg-white dark:bg-[#553311] warm:bg-[#7e5a38] border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30]',
    )}>
      <div className={cn(
        'text-2xl font-semibold tabular-nums',
        isUrgent ? 'text-red-500' : 'text-stone-800 dark:text-[#f0e0cc]',
      )}>
        {value}
      </div>
      <div className="text-xs text-stone-400 dark:text-[#e0b870] mt-0.5">{label}</div>
    </div>
  );
}

function SectionLabel({ title, count, urgent }: {
  title: string;
  count?: number;
  urgent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 px-3">
      <span className={cn(
        'text-xs font-semibold uppercase tracking-wide',
        urgent ? 'text-red-400' : 'text-stone-400',
      )}>
        {title}
      </span>
      {count !== undefined && count > 0 && (
        <span className={cn(
          'text-xs px-1.5 py-0.5 rounded-full font-medium',
          urgent ? 'bg-red-100 dark:bg-red-950 text-red-500' : 'bg-stone-100 dark:bg-[#553311] warm:bg-[#7e5a38] text-stone-500 dark:text-[#c4a882]',
        )}>
          {count}
        </span>
      )}
    </div>
  );
}

function AssignmentItem({ assignment, course }: {
  assignment: Assignment;
  course: Course | undefined;
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
    <Link
      to={course ? `/courses/${course.id}` : '#'}
      className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-[#553311] warm:hover:bg-[#7e5a38] transition-colors"
    >
      {course && (
        <span
          className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${course.color}40`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      )}
      <span className="flex-1 text-sm text-stone-700 dark:text-[#e8d5c0] truncate">{assignment.name}</span>
      <span className={cn('text-xs font-medium shrink-0 px-2 py-0.5 rounded', URGENCY_CLASS[deadline.urgency])}>
        {deadline.label}
      </span>
      <button
        onClick={handleFocusToggle}
        className={cn(
          'shrink-0 p-1 rounded transition-colors',
          inFocusList
            ? 'text-[#e2a53b]'
            : 'opacity-0 group-hover:opacity-100 text-stone-400 hover:text-[#e2a53b]'
        )}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
      >
        <Target size={13} />
      </button>
    </Link>
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
    <Link
      to="/tasks"
      className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-[#553311] warm:hover:bg-[#7e5a38] transition-colors"
    >
      <div className="w-1 h-5 rounded-full shrink-0 bg-[#7c6abf]" />
      <span className="flex-1 text-sm text-stone-700 dark:text-[#e8d5c0] truncate">{task.name}</span>
      <span className={cn('text-xs font-medium shrink-0 px-2 py-0.5 rounded', URGENCY_CLASS[deadline.urgency])}>
        {deadline.label}
      </span>
      <button
        onClick={handleFocusToggle}
        className={cn(
          'shrink-0 p-1 rounded transition-colors',
          inFocusList
            ? 'text-[#e2a53b]'
            : 'opacity-0 group-hover:opacity-100 text-stone-400 hover:text-[#e2a53b]'
        )}
        title={inFocusList ? 'Remove from focus list' : 'Add to focus list'}
      >
        <Target size={13} />
      </button>
    </Link>
  );
}

function ClassItem({ meeting, course }: { meeting: ClassMeeting; course: Course | undefined }) {
  return (
    <Link
      to={course ? `/courses/${course.id}` : '#'}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-stone-50 dark:hover:bg-[#664433] warm:hover:bg-[#8e6a48] transition-colors"
    >
      {course ? (
        <span
          className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${course.color}40`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-stone-400 font-medium">?</span>
      )}
      <span className="text-sm text-stone-700 dark:text-[#e8d5c0] flex-1 truncate">
        {course?.name ?? 'Unknown'}
      </span>
      <span className="text-xs text-stone-400 dark:text-[#e0b870] shrink-0">{formatTime(meeting.start_time)}</span>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: courses,     isLoading: coursesLoading     } = useCourses();
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();
  const { data: tasks  } = useTasks();
  const { data: meetings } = useClassMeetings();
  const { data: terms = [] } = useTerms();

  const termFilter    = usePageFiltersStore(s => s.termFilter);
  const setTermFilter = usePageFiltersStore(s => s.setTermFilter);

  // Auto-select the term whose date range contains today, once terms load
  useEffect(() => {
    if (termFilter !== null || terms.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const current = terms.find(t =>
      t.start_date && t.end_date && t.start_date <= today && today <= t.end_date
    );
    if (current) setTermFilter(current.id);
  }, [terms, termFilter, setTermFilter]);

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
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [allAssignments, todayMidnight],
  );

  const dueThisWeek = useMemo(() =>
    allAssignments
      .filter(a => {
        const d = parseDateLocal(a.due_date);
        return d >= todayMidnight && d <= weekEnd && a.status !== 'completed';
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
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

  const completedCount  = allAssignments.filter(a => a.status === 'completed').length;
  const tasksRemaining  = pendingTasks.length;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-stone-100 rounded" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 h-20 bg-stone-100 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
          <div className="h-64 bg-stone-100 rounded-xl" />
          <div className="h-64 bg-stone-100 rounded-xl" />
        </div>
      </div>
    );
  }

  const hasCourses = allCourses.length > 0;

  return (
    <div className="p-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800 dark:text-[#f0e0cc]">{greetingText()}</h1>
          <p className="mt-0.5 text-sm text-stone-400 dark:text-[#e0b870]">{todayLabel()}</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[#e2a53b] text-[#1e1208] rounded-lg hover:bg-[#d49530] transition-colors"
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
            className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 dark:border-[#442918] warm:border-[#6e4c30] bg-white dark:bg-[#553311] warm:bg-[#7e5a38] text-stone-700 dark:text-[#e8d5c0] focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-[#664433] cursor-pointer"
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
          <p className="text-stone-400 text-sm">No courses yet. Add your first one to get started.</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-3 text-sm text-stone-500 dark:text-[#c4a882] underline hover:text-stone-700 transition-colors"
          >
            Add course
          </button>
        </div>
      )}

      {hasCourses && (
        <>
          {/* ── Stat chips ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 mb-8">
            <StatChip
              label="assignments done"
              value={
                allAssignments.length > 0
                  ? `${completedCount} / ${allAssignments.length}`
                  : '—'
              }
            />
            <StatChip label="overdue"        value={overdue.length}    urgent />
            <StatChip label="due this week"  value={dueThisWeek.length}       />
            <StatChip label="tasks remaining" value={tasksRemaining}          />
          </div>

          {/* ── Content grid ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-x-8 gap-y-8">

            {/* Left: overdue + due this week */}
            <div className="space-y-8">

              {overdue.length > 0 && (
                <div>
                  <SectionLabel title="Overdue" count={overdue.length} urgent />
                  <div className="bg-white dark:bg-[#553311] warm:bg-[#7e5a38] border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-[#e8ddd0] dark:divide-[#442918] warm:divide-[#6e4c30]">
                      {overdue.map(a => (
                        <AssignmentItem
                          key={a.id}
                          assignment={a}
                          course={courseMap.get(a.course_id)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <SectionLabel title="Due this week" count={dueThisWeek.length} />
                {dueThisWeek.length === 0 ? (
                  <p className="px-3 text-sm text-stone-300 dark:text-[#cc9a58]">
                    {allAssignments.length === 0
                      ? 'Add assignments to a course to see them here.'
                      : 'Nothing due this week — enjoy the break!'}
                  </p>
                ) : (
                  <div className="bg-white dark:bg-[#553311] warm:bg-[#7e5a38] border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-[#e8ddd0] dark:divide-[#442918] warm:divide-[#6e4c30]">
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
                  <p className="px-3 text-sm text-stone-300 dark:text-[#cc9a58]">No pending tasks.</p>
                ) : (
                  <div className="bg-white dark:bg-[#553311] warm:bg-[#7e5a38] border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-[#e8ddd0] dark:divide-[#442918] warm:divide-[#6e4c30]">
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
                  <p className="px-3 text-sm text-stone-300 dark:text-[#cc9a58]">No classes today.</p>
                ) : (
                  <div className="bg-white dark:bg-[#553311] warm:bg-[#7e5a38] border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] rounded-xl shadow-sm overflow-hidden">
                    <div className="divide-y divide-[#e8ddd0] dark:divide-[#442918] warm:divide-[#6e4c30]">
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
                <div className="bg-white dark:bg-[#553311] warm:bg-[#7e5a38] border border-[#e8ddd0] dark:border-[#442918] warm:border-[#6e4c30] rounded-xl shadow-sm overflow-hidden">
                  <div className="divide-y divide-[#e8ddd0] dark:divide-[#442918] warm:divide-[#6e4c30]">
                    {allCourses.map(c => {
                      const ca = allAssignments.filter(a => a.course_id === c.id);
                      const done  = ca.filter(a => a.status === 'completed').length;
                      const total = ca.length;
                      return (
                        <Link
                          key={c.id}
                          to={`/courses/${c.id}`}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-stone-50 dark:hover:bg-[#664433] warm:hover:bg-[#8e6a48] transition-colors group"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="text-sm text-stone-700 dark:text-[#e8d5c0] flex-1 truncate group-hover:text-stone-900 dark:group-hover:text-white">
                            {c.name}
                          </span>
                          {total > 0 && (
                            <span className="text-xs text-stone-400 dark:text-[#e0b870] shrink-0 tabular-nums">
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

      <CreateCourseDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
