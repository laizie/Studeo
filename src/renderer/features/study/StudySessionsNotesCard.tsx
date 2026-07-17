import { useState, useMemo, useEffect } from 'react';
import { Timer, X, NotebookPen } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { useStudySessions } from '../../lib/queries/useStudySessions';
import {
  groupIntoSittings,
  sittingsByDay,
  sittingIntentions,
  lastReflection,
  timeOfDay,
  type Sitting,
  type TimeOfDay,
} from '../../../shared/studySittings';
import EntityNotesList from '../notes/EntityNotesList';

// How many *days* of history to show. Days, not blocks: the point of this card is
// that an afternoon reads as an afternoon, so "the last few days I studied" is the
// unit a student actually recognises.
const MAX_DAYS = 5;

function dayLabel(date: Date): string {
  if (isToday(date))     return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, MMM d');
}

const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning:      'Morning session',
  afternoon:    'Afternoon session',
  evening:      'Evening session',
  'late night': 'Late night session',
};

/**
 * What to call a sitting. A session is best known by what it was *for*, so the
 * intentions title the row — "Essay outline" says more than the clock ever will, and
 * it's the one thing that tells two identical-looking afternoons apart. Failing that
 * (no intention set), fall back to when it happened, which at least distinguishes
 * this morning's stretch from tonight's.
 */
function sittingTitle(sitting: Sitting): string {
  const intentions = sittingIntentions(sitting);
  return intentions.length > 0
    ? intentions.join(' · ')
    : TIME_OF_DAY_LABEL[timeOfDay(sitting.startedAt)];
}

/** "1h 40m" · "35m". Rounded to the minute — seconds are noise at this scale. */
function durationLabel(seconds: number): string {
  const mins  = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(mins / 60);
  const rest  = mins % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "1:00 – 3:20 PM", dropping the repeated meridiem when both ends share one. */
function timeRange(sitting: Sitting): string {
  const [startTime, startMeridiem] = format(sitting.startedAt, 'h:mm a').split(' ');
  const [endTime,   endMeridiem]   = format(sitting.endedAt,   'h:mm a').split(' ');

  return startMeridiem === endMeridiem
    ? `${startTime} – ${endTime} ${endMeridiem}`
    : `${startTime} ${startMeridiem} – ${endTime} ${endMeridiem}`;
}

function SittingNotesDialog({ sitting, onClose }: { sitting: Sitting; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" />
      <div className="relative max-h-[88vh] w-full max-w-md mx-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl animate-pop">
        <div className="mb-4 flex items-start justify-between gap-3">
          {/* Same identity as the row that opened it — the title, then the clock. */}
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink first-letter:uppercase">
              {sittingTitle(sitting)}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {dayLabel(sitting.startedAt)}, {timeRange(sitting)} · {durationLabel(sitting.focusSeconds)} focused
            </p>
          </div>
          <button onClick={onClose} className="mt-0.5 shrink-0 text-muted hover:text-ink transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <EntityNotesList
          entityType="study_session"
          entityId={sitting.id}
          newNoteTitle={`Study ${format(sitting.startedAt, 'MMM d')} — `}
          heading="Session notes"
        />
      </div>
    </div>
  );
}

/**
 * Recent study, grouped the way it was actually lived: by day, and within a day by
 * sitting rather than by Pomodoro block. The timer logs a row per block, so a normal
 * afternoon used to land here as five identical 25-minute entries; `groupIntoSittings`
 * folds those back into the one stretch they were.
 *
 * Notes hang off the sitting's first block (its anchor id), so each stretch keeps a
 * single notes thread instead of one per block.
 */
export default function StudySessionsNotesCard() {
  const { data: sessions } = useStudySessions();
  const [selected, setSelected] = useState<Sitting | null>(null);

  const days = useMemo(
    () => sittingsByDay(groupIntoSittings(sessions ?? [])).slice(0, MAX_DAYS),
    [sessions],
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Timer size={14} className="text-muted" />
        <h2 className="text-sm font-semibold text-ink-soft tracking-tight">Recent sessions</h2>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-muted">Finish a focus session to jot down what you studied.</p>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.key}>
              {/* The day's own total — what "how long did I study Tuesday?" is asking. */}
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {dayLabel(day.date)}
                </h3>
                <span className="shrink-0 text-xs font-medium tabular-nums text-ink-soft">
                  {durationLabel(day.focusSeconds)}
                </span>
              </div>

              <div className="divide-y divide-line">
                {day.sittings.map((sitting) => {
                  const reflection = lastReflection(sitting);
                  return (
                    <button
                      key={sitting.id}
                      onClick={() => setSelected(sitting)}
                      className="group flex w-full items-start gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-surface-hi transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        {/* The title carries the identity, so it gets primary ink; the
                            clock drops to meta beneath it. `first-letter:uppercase`
                            presents a typed-in intention as a title without editing
                            the user's own words. */}
                        <p className="truncate text-sm text-ink first-letter:uppercase">
                          {sittingTitle(sitting)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {timeRange(sitting)}
                          {/* Only worth saying once there's more than one block folded in. */}
                          {sitting.blocks.length > 1 && <> · {sitting.blocks.length} blocks</>}
                        </p>
                        {reflection && (
                          <p className="mt-0.5 truncate text-xs italic text-muted">“{reflection}”</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {durationLabel(sitting.focusSeconds)}
                      </span>
                      <NotebookPen
                        size={14}
                        className="mt-0.5 shrink-0 text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <SittingNotesDialog sitting={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
