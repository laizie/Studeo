import { useState, useMemo } from 'react';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';
import type { Assignment } from '../../../shared/types';
import { parseDateLocal } from '../../../shared/deadlines';
import { cn } from '../../lib/utils';
import AssignmentRow from '../courses/AssignmentRow';
import AddAssignmentDialog from '../courses/AddAssignmentDialog';

// ── Date helpers ─────────────────────────────────────────────────────────────

function getWeekBounds(): { start: Date; end: Date } {
  const today = new Date();
  const day = today.getDay(); // 0=Sun … 6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMon);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function formatWeekRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = start.toLocaleDateString('en-US', opts);
  const e = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${s} – ${e}`;
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ThisWeekPage() {
  const { data: courses } = useCourses();
  const { data: assignments, isLoading } = useAssignments();

  const [showCompleted, setShowCompleted] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const courseMap = useMemo(
    () => new Map((courses ?? []).map(c => [c.id, c])),
    [courses]
  );

  const { start: weekStart, end: weekEnd } = getWeekBounds();

  // All assignments due on or before Sunday of this week (includes overdue).
  // Optionally filter out completed ones.
  const relevant = useMemo(() => {
    return (assignments ?? [])
      .filter(a => {
        const due = parseDateLocal(a.due_date);
        if (due > weekEnd) return false;
        if (!showCompleted && a.status === 'completed') return false;
        return true;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [assignments, weekEnd, showCompleted]);

  // Group by display-day label so we can render dividers.
  const grouped = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of relevant) {
      const label = dayLabel(parseDateLocal(a.due_date));
      if (!map.has(label)) map.set(label, []);
      const bucket = map.get(label);
      if (bucket) bucket.push(a);
    }
    return map;
  }, [relevant]);

  function openEdit(a: Assignment) {
    setEditingAssignment(a);
    setDialogOpen(true);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">This Week</h1>
          <p className="mt-0.5 text-sm text-stone-400">{formatWeekRange(weekStart, weekEnd)}</p>
        </div>
        <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-stone-100 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && relevant.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-stone-400 text-sm">
            {showCompleted
              ? 'Nothing due this week.'
              : 'Nothing due this week — or everything is done.'}
          </p>
          {!showCompleted && (
            <button
              onClick={() => setShowCompleted(true)}
              className="mt-2 text-xs text-stone-400 underline hover:text-stone-600 transition-colors"
            >
              Show completed
            </button>
          )}
        </div>
      )}

      {/* Grouped rows */}
      {!isLoading && relevant.length > 0 && (
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([label, items]) => (
            <div key={label}>
              <div className={cn(
                'text-xs font-semibold uppercase tracking-wide mb-1 px-3',
                label === 'Overdue' ? 'text-red-400' : 'text-stone-400'
              )}>
                {label}
              </div>
              <div className="-mx-3">
                {items.map(a => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    onEdit={openEdit}
                    course={courseMap.get(a.course_id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats footer */}
      {!isLoading && relevant.length > 0 && (
        <div className="mt-6 pt-4 border-t border-stone-100 flex gap-4 text-xs text-stone-400">
          <span>{relevant.filter(a => a.status === 'completed').length} completed</span>
          <span>{relevant.filter(a => a.status !== 'completed').length} remaining</span>
          {!showCompleted && assignments && (
            <button
              onClick={() => setShowCompleted(true)}
              className="underline hover:text-stone-600 transition-colors"
            >
              + show completed
            </button>
          )}
        </div>
      )}

      {/* Edit dialog — no "add new" from this view; use Quick Add or go to a course */}
      <AddAssignmentDialog
        courseId={editingAssignment?.course_id ?? ''}
        assignment={editingAssignment}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
