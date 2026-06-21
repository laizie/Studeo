import { useState, useMemo } from 'react';
import { X, CalendarPlus, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { Assignment, Course } from '../../../shared/types';
import { planStudyBlocks, suggestSessionCount, daysUntil } from '../../../shared/studyPlan';
import { parseDateLocal } from '../../../shared/deadlines';
import {
  useStudyBlocks,
  useCreateStudyBlocks,
  useDeleteStudyBlocksForAssignment,
} from '../../lib/queries/useStudyBlocks';
import { usePageFiltersStore } from '../../store/usePageFiltersStore';
import { cn } from '../../lib/utils';

interface Props {
  assignment: Assignment;
  course?: Course;
  onClose: () => void;
}

const DURATIONS = [25, 50, 90];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Plan a set of study blocks leading up to an exam and write them onto the calendar.
export default function PlanStudyDialog({ assignment, course, onClose }: Props) {
  const today    = todayStr();
  const examDate = assignment.due_date.slice(0, 10);
  const days     = daysUntil(examDate, today);

  const { data: allBlocks } = useStudyBlocks();
  const existing = useMemo(
    () => (allBlocks ?? []).filter(b => b.assignment_id === assignment.id),
    [allBlocks, assignment.id],
  );

  const [sessions, setSessions] = useState(() => Math.min(suggestSessionCount(days), Math.max(1, days)));
  const [duration, setDuration] = useState(50);

  const createBlocks = useCreateStudyBlocks();
  const clearExisting = useDeleteStudyBlocksForAssignment();
  const setCalendarShowStudyBlocks = usePageFiltersStore(s => s.setCalendarShowStudyBlocks);

  const title = `Study: ${assignment.name}`;
  const preview = useMemo(
    () => planStudyBlocks(examDate, today, { sessions, durationMinutes: duration, title }),
    [examDate, today, sessions, duration, title],
  );

  // Can't have more blocks than days before the exam (one per day, max).
  const maxSessions = Math.max(1, Math.min(6, days));
  const sessionChoices = Array.from({ length: maxSessions }, (_, i) => i + 1);

  async function handleAdd() {
    if (preview.length === 0) return;
    if (existing.length > 0) await clearExisting.mutateAsync(assignment.id);
    await createBlocks.mutateAsync(
      preview.map(b => ({
        assignmentId: assignment.id,
        courseId: assignment.course_id,
        title: b.title,
        scheduledDate: b.scheduledDate,
        durationMinutes: b.durationMinutes,
      })),
    );
    // Make sure the freshly-added plan is actually visible on the calendar.
    setCalendarShowStudyBlocks(true);
    onClose();
  }

  const isPending = createBlocks.isPending || clearExisting.isPending;
  const tooLate = days <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative mx-4 max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <CalendarPlus size={17} className="text-accent" />
            Plan study sessions
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink-soft transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="mb-5 text-sm text-muted">
          <span className="font-medium text-ink-soft">{assignment.name}</span>
          {course && <> · {course.abbreviation}</>} ·{' '}
          {tooLate
            ? 'is today or already passed'
            : <>{format(parseDateLocal(examDate), 'EEE, MMM d')} — <span className="text-ink-soft">{days} {days === 1 ? 'day' : 'days'} away</span></>}
        </p>

        {tooLate ? (
          <div className="flex items-start gap-2 rounded-lg bg-inset px-3 py-3 text-sm text-muted">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            There aren't any days left before this exam to plan sessions onto.
          </div>
        ) : (
          <>
            {/* Sessions */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">How many sessions</p>
              <div className="flex flex-wrap gap-1 rounded-lg bg-inset p-1">
                {sessionChoices.map(n => (
                  <button
                    key={n}
                    onClick={() => setSessions(n)}
                    className={cn(
                      'h-8 w-9 rounded-md text-sm font-medium transition-colors',
                      sessions === n ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:bg-surface-hi',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Each session</p>
              <div className="flex gap-1 rounded-lg bg-inset p-1">
                {DURATIONS.map(d => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      duration === d ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:bg-surface-hi',
                    )}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="mb-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {preview.length} {preview.length === 1 ? 'session' : 'sessions'} on your calendar
              </p>
              <div className="divide-y divide-line rounded-lg border border-line">
                {preview.map((b, i) => (
                  <div key={b.scheduledDate} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-5 text-xs text-muted tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-ink-soft">{format(parseDateLocal(b.scheduledDate), 'EEE, MMM d')}</span>
                    <span className="text-xs text-muted">{b.durationMinutes} min</span>
                  </div>
                ))}
              </div>
            </div>

            {existing.length > 0 && (
              <p className="mb-4 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                This exam already has {existing.length} planned {existing.length === 1 ? 'session' : 'sessions'} — adding will replace {existing.length === 1 ? 'it' : 'them'}.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={isPending || preview.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                <CalendarPlus size={15} />
                {isPending ? 'Adding…' : existing.length > 0 ? 'Replace plan' : 'Add to calendar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
