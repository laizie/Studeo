import { useMemo } from 'react';
import { CheckCircle2, TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useTasks } from '../../lib/queries/useTasks';
import { useStudySessions } from '../../lib/queries/useStudySessions';
import { useRescheduleItems } from '../../lib/queries/useRescheduleItems';
import QueryErrorState from '../../components/QueryErrorState';
import { buildWeeklyReview, type ReviewItem } from '../../../shared/weeklyReview';
import { showUndoToast } from '../../store/useToastStore';
import { formatDueDate } from '../../../shared/deadlines';
import { localDayKey } from '../../../shared/studyStats';
import type { Course } from '../../../shared/types';
import { cn } from '../../lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "45 min" under an hour, else "1.5 hrs" (trailing .0 stripped). */
function formatMinutes(mins: number): string {
  const m = Math.round(mins);
  if (m < 60) return `${m} min`;
  const hrs = Math.round((m / 60) * 10) / 10;
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'}`;
}

/** "Mar 9 – Mar 15" from the two YYYY-MM-DD week bounds. */
function formatWeekRange(startKey: string, endKey: string): string {
  return `${formatDueDate(startKey)} – ${formatDueDate(endKey)}`;
}

// ── Course badge (matches the dashboard's accent-pill treatment) ────────────────

function CourseBadge({ course }: { course: Course | undefined }) {
  if (!course) return null;
  return (
    <span
      className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${course.color}40`, color: course.color }}
    >
      {course.abbreviation}
    </span>
  );
}

// ── Focus comparison: two bars, this week vs last ───────────────────────────────

function FocusCompare({ thisWeek, lastWeek, delta }: {
  thisWeek: number; lastWeek: number; delta: number;
}) {
  const max = Math.max(thisWeek, lastWeek, 1);
  const pct = (v: number) => `${Math.max((v / max) * 100, v > 0 ? 4 : 0)}%`;

  // Trend line under the bars. Brand-new focus (nothing last week) reads as a win,
  // not a "+∞".
  let trend: { icon: typeof TrendingUp; text: string; className: string };
  if (lastWeek === 0 && thisWeek > 0) {
    trend = { icon: Sparkles, text: 'First focused week — nice start', className: 'text-green-700 dark:text-green-400' };
  } else if (delta > 0) {
    trend = { icon: TrendingUp, text: `${formatMinutes(delta)} more than last week`, className: 'text-green-700 dark:text-green-400' };
  } else if (delta < 0) {
    trend = { icon: TrendingDown, text: `${formatMinutes(-delta)} less than last week`, className: 'text-stone-500 dark:text-muted' };
  } else {
    trend = { icon: Minus, text: 'Same as last week', className: 'text-stone-500 dark:text-muted' };
  }
  const TrendIcon = trend.icon;

  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm p-4">
      <div className="space-y-2.5">
        {[
          { label: 'This week', value: thisWeek, accent: true },
          { label: 'Last week', value: lastWeek, accent: false },
        ].map(row => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted">{row.label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-surface-hi overflow-hidden">
              <div
                className={cn('h-full rounded-full', row.accent ? 'bg-accent' : 'bg-stone-300 dark:bg-stone-600')}
                style={{ width: pct(row.value) }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-sm font-medium text-ink-soft tabular-nums">
              {formatMinutes(row.value)}
            </span>
          </div>
        ))}
      </div>
      <div className={cn('mt-3 flex items-center gap-1.5 text-xs font-medium', trend.className)}>
        <TrendIcon size={13} className="shrink-0" />
        {trend.text}
      </div>
    </div>
  );
}

// ── Item rows ───────────────────────────────────────────────────────────────────

function DoneRow({ item, course }: { item: ReviewItem; course: Course | undefined }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <CheckCircle2 size={15} className="shrink-0 text-green-600 dark:text-green-500" />
      {item.kind === 'assignment'
        ? <CourseBadge course={course} />
        : <div className="w-1 h-5 rounded-full shrink-0 bg-[#7c6abf]" />}
      <span className="flex-1 min-w-0 truncate text-sm text-muted line-through decoration-stone-300 dark:decoration-stone-600">
        {item.name}
      </span>
    </div>
  );
}

function RolloverRow({ item, course }: { item: ReviewItem; course: Course | undefined }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {item.kind === 'assignment'
        ? <CourseBadge course={course} />
        : <div className="w-1 h-5 rounded-full shrink-0 bg-[#7c6abf]" />}
      <span className="flex-1 min-w-0 truncate text-sm text-ink-soft">{item.name}</span>
      <span className="shrink-0 text-xs font-medium text-muted tabular-nums">
        was {formatDueDate(item.dueDate)}
      </span>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

function SectionLabel({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {count !== undefined && count > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-surface text-stone-600 dark:text-muted">
          {count}
        </span>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function WeeklyReviewPage() {
  const { data: courses, isLoading: coursesLoading, isError: coursesError, refetch: refetchCourses } = useCourses();
  const { data: assignments, isLoading: assignmentsLoading, isError: assignmentsError, refetch: refetchAssignments } = useAssignments();
  const { data: tasks = [] } = useTasks();
  const { data: sessions = [] } = useStudySessions();
  const reschedule = useRescheduleItems();

  const review = useMemo(
    () => buildWeeklyReview(assignments ?? [], tasks, sessions),
    [assignments, tasks, sessions],
  );

  const courseMap = useMemo(
    () => new Map((courses ?? []).map(c => [c.id, c])),
    [courses],
  );

  if (coursesLoading || assignmentsLoading) {
    const block = 'bg-surface rounded-xl';
    return (
      <div className="p-8 max-w-2xl animate-pulse">
        <div className={cn('h-7 w-44 mb-2', block)} />
        <div className={cn('h-4 w-28 mb-8', block)} />
        <div className="space-y-8">
          <div className={cn('h-28', block)} />
          <div className={cn('h-40', block)} />
          <div className={cn('h-32', block)} />
        </div>
      </div>
    );
  }

  if (coursesError || assignmentsError) {
    return (
      <div className="p-8">
        <QueryErrorState
          title="Couldn't load your weekly review"
          message="Your data is saved on this device — this is usually a brief hiccup."
          onRetry={() => { refetchCourses(); refetchAssignments(); }}
        />
      </div>
    );
  }

  function handleMoveAll() {
    // Keep each row's old date so Undo can put everything back where it was.
    const prior = review.rollover.map(({ kind, id, dueDate }) => ({ kind, id, dueDate }));
    const today = localDayKey(new Date());
    reschedule.mutate(
      { items: review.rollover.map(({ kind, id }) => ({ kind, id })), dueDate: today },
      {
        onSuccess: () =>
          showUndoToast(`Moved ${prior.length} to today`, () =>
            reschedule.mutate({ items: prior, dueDate: today }),
          ),
      },
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Weekly Review</h1>
        <p className="mt-0.5 text-sm text-muted">
          {formatWeekRange(review.weekStart, review.weekEnd)}
        </p>
      </div>

      <div className="space-y-8">
        {/* Focus vs last week */}
        <div>
          <SectionLabel title="Focus this week" />
          <FocusCompare
            thisWeek={review.focusThisWeekMinutes}
            lastWeek={review.focusLastWeekMinutes}
            delta={review.focusDeltaMinutes}
          />
        </div>

        {/* What got done */}
        <div>
          <SectionLabel title="What got done" count={review.completedCount} />
          {review.completed.length === 0 ? (
            <p className="px-1 text-sm text-muted">
              Nothing marked done this week yet — completed assignments and tasks will land here.
            </p>
          ) : (
            <SectionCard>
              {review.completed.map(item => (
                <DoneRow key={`${item.kind}-${item.id}`} item={item} course={courseMap.get(item.courseId ?? '')} />
              ))}
            </SectionCard>
          )}
        </div>

        {/* Rolls over */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel title="Rolls over" count={review.rolloverCount} />
            {review.rollover.length > 0 && (
              <button
                onClick={handleMoveAll}
                disabled={reschedule.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-ink hover:bg-accent-deep active:scale-[0.98] transition-colors disabled:opacity-60"
              >
                {reschedule.isPending
                  ? 'Moving…'
                  : <>Move all to today <ArrowRight size={13} /></>}
              </button>
            )}
          </div>
          {review.rollover.length === 0 ? (
            <p className="px-1 text-sm text-muted">Nothing overdue — you're all caught up. 🎉</p>
          ) : (
            <SectionCard>
              {review.rollover.map(item => (
                <RolloverRow key={`${item.kind}-${item.id}`} item={item} course={courseMap.get(item.courseId ?? '')} />
              ))}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
