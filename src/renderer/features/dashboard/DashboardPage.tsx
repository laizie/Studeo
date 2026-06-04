import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTasks } from '../../lib/queries/useTasks';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import type { Assignment, Course, ClassMeeting } from '../../../shared/types';
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
      isUrgent ? 'bg-red-50 border-red-200' : 'bg-white border-[#e8ddd0]',
    )}>
      <div className={cn(
        'text-2xl font-semibold tabular-nums',
        isUrgent ? 'text-red-500' : 'text-stone-800',
      )}>
        {value}
      </div>
      <div className="text-xs text-stone-400 mt-0.5">{label}</div>
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
          urgent ? 'bg-red-100 text-red-500' : 'bg-stone-100 text-stone-500',
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
  return (
    <Link
      to={course ? `/courses/${course.id}` : '#'}
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
    >
      <div
        className="w-0.5 h-5 rounded-full shrink-0"
        style={{ backgroundColor: course?.color ?? '#a8a29e' }}
      />
      <span className="flex-1 text-sm text-stone-700 truncate">{assignment.name}</span>
      {course && (
        <span
          className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium"
          style={{ backgroundColor: `${course.color}1a`, color: course.color }}
        >
          {course.abbreviation}
        </span>
      )}
      <span className={cn('text-xs font-medium shrink-0 w-[72px] text-right', {
        'text-red-500':   deadline.urgency === 'overdue',
        'text-amber-500': deadline.urgency === 'today',
        'text-amber-400': deadline.urgency === 'soon',
        'text-stone-400': deadline.urgency === 'upcoming',
      })}>
        {deadline.label}
      </span>
    </Link>
  );
}

function ClassItem({ meeting, course }: { meeting: ClassMeeting; course: Course | undefined }) {
  return (
    <Link
      to={course ? `/courses/${course.id}` : '#'}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: course?.color ?? '#a8a29e' }}
      />
      <span className="text-sm text-stone-700 flex-1 truncate">
        {course?.abbreviation ?? '?'}
      </span>
      <span className="text-xs text-stone-400 shrink-0">{formatTime(meeting.start_time)}</span>
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

  const isLoading = coursesLoading || assignmentsLoading;

  const courseMap = useMemo(
    () => new Map((courses ?? []).map(c => [c.id, c])),
    [courses],
  );

  const todayMidnight = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const weekEnd    = useMemo(() => getWeekEnd(), []);
  const todayDow   = new Date().getDay();

  const allCourses     = courses     ?? [];
  const allAssignments = assignments ?? [];
  const allTasks       = tasks       ?? [];
  const allMeetings    = meetings    ?? [];

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

  const completedCount  = allAssignments.filter(a => a.status === 'completed').length;
  const tasksRemaining  = allTasks.filter(t => t.status !== 'completed').length;

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
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">{greetingText()}</h1>
          <p className="mt-0.5 text-sm text-stone-400">{todayLabel()}</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
        >
          <Plus size={15} />
          Add course
        </button>
      </div>

      {/* ── No courses empty state ───────────────────────────────────────────── */}
      {!hasCourses && (
        <div className="text-center py-24">
          <p className="text-stone-400 text-sm">No courses yet. Add your first one to get started.</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-3 text-sm text-stone-500 underline hover:text-stone-700 transition-colors"
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
                  <div className="-mx-3">
                    {overdue.map(a => (
                      <AssignmentItem
                        key={a.id}
                        assignment={a}
                        course={courseMap.get(a.course_id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <SectionLabel title="Due this week" count={dueThisWeek.length} />
                {dueThisWeek.length === 0 ? (
                  <p className="px-3 text-sm text-stone-300">
                    {allAssignments.length === 0
                      ? 'Add assignments to a course to see them here.'
                      : 'Nothing due this week — enjoy the break!'}
                  </p>
                ) : (
                  <div className="-mx-3">
                    {dueThisWeek.map(a => (
                      <AssignmentItem
                        key={a.id}
                        assignment={a}
                        course={courseMap.get(a.course_id)}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right: today's classes + courses */}
            <div className="space-y-8">

              <div>
                <SectionLabel title="Today's classes" />
                {todayClasses.length === 0 ? (
                  <p className="px-3 text-sm text-stone-300">No classes today.</p>
                ) : (
                  <div className="-mx-3">
                    {todayClasses.map(m => (
                      <ClassItem
                        key={m.id}
                        meeting={m}
                        course={courseMap.get(m.course_id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionLabel title="Courses" />
                <div className="-mx-3">
                  {allCourses.map(c => {
                    const ca = allAssignments.filter(a => a.course_id === c.id);
                    const done  = ca.filter(a => a.status === 'completed').length;
                    const total = ca.length;
                    return (
                      <Link
                        key={c.id}
                        to={`/courses/${c.id}`}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors group"
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="text-sm text-stone-700 flex-1 truncate group-hover:text-stone-900">
                          {c.name}
                        </span>
                        {total > 0 && (
                          <span className="text-xs text-stone-400 shrink-0 tabular-nums">
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
        </>
      )}

      <CreateCourseDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
