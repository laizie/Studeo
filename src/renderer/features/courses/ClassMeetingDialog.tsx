import { useState, useEffect, useRef, useId } from 'react';
import DialogShell from '../../components/DialogShell';
import type { ClassMeeting } from '../../../shared/types';
import { useCreateClassMeeting, useUpdateClassMeeting } from '../../lib/queries/useClassMeetings';
import { INPUT_CLASS } from '../../lib/inputClass';
import { errorReason } from '../../lib/errors';
import { showToast } from '../../store/useToastStore';

interface Props {
  courseId: string;
  meeting?: ClassMeeting;
  /** The course's building, used as the placeholder: it's the room this time
   *  falls back to when the field is left blank, so it should be visible while
   *  deciding whether to fill one in. */
  courseBuilding?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const DAYS = [
  { label: 'Sunday',    value: 0 },
  { label: 'Monday',    value: 1 },
  { label: 'Tuesday',   value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday',  value: 4 },
  { label: 'Friday',    value: 5 },
  { label: 'Saturday',  value: 6 },
];


export default function ClassMeetingDialog({ courseId, meeting, courseBuilding, isOpen, onClose }: Props) {
  const isEditing = !!meeting;

  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime]     = useState('10:00');
  // Per-meeting room. A course rarely meets in one place all week — the Tuesday
  // lab isn't the Monday lecture hall — so the place belongs to the time, not to
  // the course. Blank falls back to the course's building.
  const [location, setLocation]   = useState('');

  const createMeeting = useCreateClassMeeting();
  const updateMeeting = useUpdateClassMeeting();
  const dayRef = useRef<HTMLSelectElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!isOpen) return;
    if (meeting) {
      setDayOfWeek(meeting.day_of_week);
      setStartTime(meeting.start_time);
      setEndTime(meeting.end_time);
      setLocation(meeting.location ?? '');
    } else {
      setDayOfWeek(1);
      setStartTime('09:00');
      setEndTime('10:00');
      setLocation('');
    }
    setTimeout(() => dayRef.current?.focus(), 50);
  }, [isOpen, meeting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startTime || !endTime) return;

    try {
      const room = location.trim();
      if (isEditing) {
        await updateMeeting.mutateAsync({
          id: meeting.id,
          // location is null, not undefined, when the field is empty: the repo reads an
          // absent key as "leave this alone", so clearing a room has to say so explicitly.
          input: { dayOfWeek, startTime, endTime, location: room || null },
        });
        showToast('Class time updated');
      } else {
        await createMeeting.mutateAsync({
          courseId, dayOfWeek, startTime, endTime, location: room || undefined,
        });
        showToast('Class time added');
      }
      onClose();
    } catch {
      // mutateAsync rethrows on failure. Skipping the rest is the behaviour we want —
      // the surface stays open holding what the user typed — but the rejection still
      // has to be *handled* or it surfaces as an unhandled promise rejection. The
      // mutation cache's global onError has already shown the user a toast.
    }
  }

  const isPending = createMeeting.isPending || updateMeeting.isPending;
  const isError   = createMeeting.isError   || updateMeeting.isError;
  const mutationError = createMeeting.error ?? updateMeeting.error;

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit class time' : 'Add class time'}
      maxWidth="max-w-sm"
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${uid}-day`} className="block text-sm font-medium text-ink-soft mb-1">Day</label>
            <select
              id={`${uid}-day`}
              ref={dayRef}
              value={dayOfWeek}
              onChange={e => setDayOfWeek(Number(e.target.value))}
              className={INPUT_CLASS}
            >
              {DAYS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-start`} className="block text-sm font-medium text-ink-soft mb-1">Start</label>
              <input
                id={`${uid}-start`}
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-end`} className="block text-sm font-medium text-ink-soft mb-1">End</label>
              <input
                id={`${uid}-end`}
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${uid}-location`} className="block text-sm font-medium text-ink-soft mb-1">
              Room <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id={`${uid}-location`}
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder={courseBuilding || 'e.g. Science Hall 204'}
              className={INPUT_CLASS}
            />
            <p className="mt-1 text-xs text-muted">
              {courseBuilding
                ? `Leave empty for ${courseBuilding}.`
                : 'Set this when a day meets somewhere other than the usual room.'}
            </p>
          </div>

          {isError && (
            <p className="text-sm text-red-600">{errorReason(mutationError) ?? 'Something went wrong'} — please try again.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!startTime || !endTime || isPending}
              className="px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Add time'}
            </button>
          </div>
        </form>
    </DialogShell>
  );
}
