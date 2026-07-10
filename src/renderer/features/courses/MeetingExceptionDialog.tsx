import { useState, useEffect, useRef } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { ClassMeeting, MeetingExceptionKind } from '../../../shared/types';
import {
  useMeetingExceptions,
  useCreateMeetingException,
  useDeleteMeetingException,
} from '../../lib/queries/useMeetingExceptions';
import { parseDateLocal, formatDueDate } from '../../../shared/deadlines';
import { cn } from '../../lib/utils';

interface Props {
  meeting?: ClassMeeting;
  isOpen: boolean;
  onClose: () => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-stone-300 rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent ' +
  'dark:bg-inset dark:border-line dark:text-ink dark:focus:ring-muted';

export default function MeetingExceptionDialog({ meeting, isOpen, onClose }: Props) {
  const [date, setDate]         = useState('');
  const [kind, setKind]         = useState<MeetingExceptionKind>('cancelled');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd]     = useState('');
  const [newLocation, setNewLocation] = useState('');

  const dateRef = useRef<HTMLInputElement>(null);

  const { data: exceptions = [] } = useMeetingExceptions(
    meeting ? { meetingId: meeting.id } : {}
  );
  const createException = useCreateMeetingException();
  const deleteException = useDeleteMeetingException();

  useEffect(() => {
    if (!isOpen || !meeting) return;
    setDate('');
    setKind('cancelled');
    setNewStart(meeting.start_time);
    setNewEnd(meeting.end_time);
    setNewLocation('');
    setTimeout(() => dateRef.current?.focus(), 50);
  }, [isOpen, meeting]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !meeting) return null;

  // An exception for a date the class doesn't even meet on would silently do
  // nothing — catch the likely typo before save.
  const wrongDay = date !== '' && parseDateLocal(date).getDay() !== meeting.day_of_week;
  const canSubmit = date !== '' && !wrongDay && (kind === 'cancelled' || (newStart && newEnd));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meeting || !canSubmit) return;
    await createException.mutateAsync({
      meetingId: meeting.id,
      date,
      kind,
      ...(kind === 'moved' && {
        newStartTime: newStart,
        newEndTime: newEnd,
        newLocation: newLocation.trim() || undefined,
      }),
    });
    setDate('');
    setKind('cancelled');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-pop">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-ink">Schedule exceptions</h2>
          <button onClick={onClose} className="text-muted hover:text-ink-soft transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted mb-5">
          One-off changes to the {DAY_NAMES[meeting.day_of_week]} class — a holiday, a
          cancelled lecture, or a moved time. The weekly schedule stays unchanged.
        </p>

        {/* Existing exceptions */}
        {exceptions.length > 0 && (
          <div className="mb-5 border border-line rounded-lg divide-y divide-line overflow-hidden">
            {exceptions.map(ex => (
              <div key={ex.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-sm text-ink-soft w-16 shrink-0">{formatDueDate(ex.date)}</span>
                <span className="flex-1 text-xs text-muted">
                  {ex.kind === 'cancelled'
                    ? 'Cancelled'
                    : `Moved to ${ex.new_start_time}–${ex.new_end_time}${ex.new_location ? ` · ${ex.new_location}` : ''}`}
                </span>
                <button
                  onClick={() => deleteException.mutate(ex.id)}
                  aria-label={`Remove exception on ${ex.date}`}
                  className="p-1 text-muted hover:text-red-500 rounded transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">Date</label>
              <input
                ref={dateRef}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">What happens</label>
              <select
                value={kind}
                onChange={e => setKind(e.target.value as MeetingExceptionKind)}
                className={INPUT_CLASS}
              >
                <option value="cancelled">Class is cancelled</option>
                <option value="moved">Time/room changes</option>
              </select>
            </div>
          </div>

          {wrongDay && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              That date is a {DAY_NAMES[parseDateLocal(date).getDay()]} — this class meets
              on {DAY_NAMES[meeting.day_of_week]}s.
            </p>
          )}

          {kind === 'moved' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">New start</label>
                <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">New end</label>
                <input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink-soft mb-1">
                  New location <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder={meeting.location ?? 'e.g. Room 110'}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}

          {createException.isError && (
            <p className="text-sm text-red-600">Something went wrong — please try again.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-ink-soft transition-colors"
            >
              Done
            </button>
            <button
              type="submit"
              disabled={!canSubmit || createException.isPending}
              className={cn(
                'px-4 py-2 text-sm bg-accent text-accent-ink rounded-lg hover:bg-accent-deep active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              )}
            >
              {createException.isPending ? 'Saving…' : 'Add exception'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
