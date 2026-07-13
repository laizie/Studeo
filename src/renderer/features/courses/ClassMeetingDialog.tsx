import { useState, useEffect, useRef, useId } from 'react';
import DialogShell from '../../components/DialogShell';
import type { ClassMeeting } from '../../../shared/types';
import { useCreateClassMeeting, useUpdateClassMeeting } from '../../lib/queries/useClassMeetings';

interface Props {
  courseId: string;
  meeting?: ClassMeeting;
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

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-stone-300 rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent ' +
  'dark:bg-inset dark:border-line dark:text-ink dark:focus:ring-muted';

export default function ClassMeetingDialog({ courseId, meeting, isOpen, onClose }: Props) {
  const isEditing = !!meeting;

  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime]     = useState('10:00');

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
    } else {
      setDayOfWeek(1);
      setStartTime('09:00');
      setEndTime('10:00');
    }
    setTimeout(() => dayRef.current?.focus(), 50);
  }, [isOpen, meeting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startTime || !endTime) return;

    if (isEditing) {
      await updateMeeting.mutateAsync({
        id: meeting.id,
        input: { dayOfWeek, startTime, endTime },
      });
    } else {
      await createMeeting.mutateAsync({ courseId, dayOfWeek, startTime, endTime });
    }
    onClose();
  }

  const isPending = createMeeting.isPending || updateMeeting.isPending;
  const isError   = createMeeting.isError   || updateMeeting.isError;

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

          {isError && (
            <p className="text-sm text-red-600">Something went wrong — please try again.</p>
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
