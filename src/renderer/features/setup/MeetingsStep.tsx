import { useMemo, useState } from 'react';
import { ArrowLeft, X, Plus } from 'lucide-react';
import { useCourses } from '../../lib/queries/useCourses';
import {
  useClassMeetings,
  useCreateClassMeeting,
  useDeleteClassMeeting,
} from '../../lib/queries/useClassMeetings';
import { expandWeekdayMeetings, timeRangeValid } from '../../../shared/semesterSetup';
import { formatClock12 } from '../../../shared/deadlines';
import type { Course } from '../../../shared/types';
import { cn } from '../../lib/utils';
import { WIZARD_INPUT, WEEKDAY_LABELS, DAY_ABBR } from './constants';

interface Props {
  termId: string;
  onBack: () => void;
  onNext: () => void;
}

/** Step 3 — weekly class times, one editor per course. Optional: a student can
 *  skip and add them later from the course page. */
export default function MeetingsStep({ termId, onBack, onNext }: Props) {
  const { data: allCourses = [] } = useCourses();
  const courses = useMemo(
    () => allCourses.filter(c => c.term_id === termId),
    [allCourses, termId],
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Set class times</h2>
        <p className="mt-1 text-sm text-muted">
          Pick the weekdays a course meets and its hours — one entry covers the
          whole recurring pattern (e.g. Mon/Wed/Fri 9–9:50). Optional; you can add
          these later.
        </p>
      </div>

      <div className="space-y-3">
        {courses.map(c => (
          <CourseMeetingsEditor key={c.id} course={c} />
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink-soft"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <button
          onClick={onNext}
          className="rounded-lg bg-accent px-5 py-2 text-sm text-accent-ink transition-colors hover:bg-accent-deep"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/** The per-course editor: existing meeting chips + a "days × time" add row. */
function CourseMeetingsEditor({ course }: { course: Course }) {
  const { data: meetings = [] } = useClassMeetings({ courseId: course.id });
  const createMeeting = useCreateClassMeeting();
  const deleteMeeting = useDeleteClassMeeting();

  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('09:50');

  const rangeInvalid = !timeRangeValid(start, end);
  const canAdd = days.length > 0 && !rangeInvalid && !createMeeting.isPending;

  function toggleDay(day: number) {
    setDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]));
  }

  async function handleAdd() {
    if (!canAdd) return;
    // One selection → one meeting per weekday (MWF 9–10 becomes three rows).
    for (const input of expandWeekdayMeetings(course.id, days, start, end)) {
      await createMeeting.mutateAsync(input);
    }
    setDays([]);
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
        <span className="text-sm font-medium text-ink">{course.name}</span>
      </div>

      {/* Saved meetings */}
      {meetings.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {meetings.map(m => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-hi px-2.5 py-1 text-xs text-ink-soft"
            >
              {DAY_ABBR[m.day_of_week]} {formatClock12(m.start_time)}–{formatClock12(m.end_time)}
              <button
                onClick={() => deleteMeeting.mutate(m.id)}
                aria-label="Remove class time"
                className="text-muted transition-colors hover:text-red-500"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add row: weekday toggles + time range */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="mb-1 block text-xs text-muted">Days</span>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={days.includes(day)}
                className={cn(
                  'h-8 w-8 rounded-md text-xs font-medium transition-colors',
                  days.includes(day)
                    ? 'bg-accent text-accent-ink'
                    : 'bg-surface-hi text-muted hover:text-ink-soft',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label>
          <span className="mb-1 block text-xs text-muted">Start</span>
          <input type="time" value={start} onChange={e => setStart(e.target.value)} className={`${WIZARD_INPUT} w-auto`} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">End</span>
          <input type="time" value={end} onChange={e => setEnd(e.target.value)} className={`${WIZARD_INPUT} w-auto`} />
        </label>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg bg-surface-hi px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} />
          Add
        </button>
      </div>

      {rangeInvalid && days.length > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          The end time must be after the start time.
        </p>
      )}
    </div>
  );
}
