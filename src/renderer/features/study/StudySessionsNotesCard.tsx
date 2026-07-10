import { useState, useMemo, useEffect } from 'react';
import { Timer, X, NotebookPen } from 'lucide-react';
import { format } from 'date-fns';
import type { StudySession } from '../../../shared/types';
import { useStudySessions } from '../../lib/queries/useStudySessions';
import EntityNotesList from '../notes/EntityNotesList';

const MAX_SHOWN = 6;

function sessionLabel(s: StudySession): string {
  return format(new Date(s.started_at), 'EEE, MMM d · h:mm a');
}
function durationLabel(s: StudySession): string {
  return `${Math.max(1, Math.round(s.duration_seconds / 60))} min`;
}

function SessionNotesDialog({ session, onClose }: { session: StudySession; onClose: () => void }) {
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            Study session <span className="font-normal text-muted">· {sessionLabel(session)}</span>
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <EntityNotesList
          entityType="study_session"
          entityId={session.id}
          newNoteTitle={`Study ${format(new Date(session.started_at), 'MMM d')} — `}
          heading="Session notes"
        />
      </div>
    </div>
  );
}

/** Recent focus sessions, each opening its own notes dialog ("what I studied"). */
export default function StudySessionsNotesCard() {
  const { data: sessions } = useStudySessions();
  const [selected, setSelected] = useState<StudySession | null>(null);

  const recentFocus = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.kind === 'focus')
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, MAX_SHOWN),
    [sessions],
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Timer size={14} className="text-muted" />
        <h2 className="text-sm font-semibold text-ink-soft tracking-tight">Recent sessions</h2>
      </div>

      {recentFocus.length === 0 ? (
        <p className="text-sm text-muted">Finish a focus session to jot down what you studied.</p>
      ) : (
        <div className="divide-y divide-line">
          {recentFocus.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="group flex w-full items-start gap-3 px-1 py-2.5 text-left hover:bg-surface-hi rounded-lg transition-colors"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm text-ink-soft">{sessionLabel(s)}</span>
                {s.intention && (
                  <p className="mt-0.5 truncate text-xs text-muted">
                    <span className="text-muted/80">Intention:</span> {s.intention}
                  </p>
                )}
                {s.reflection && (
                  <p className="mt-0.5 truncate text-xs italic text-muted">“{s.reflection}”</p>
                )}
              </div>
              <span className="mt-0.5 shrink-0 text-xs text-muted tabular-nums">{durationLabel(s)}</span>
              <NotebookPen
                size={14}
                className="mt-0.5 shrink-0 text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      )}

      {selected && <SessionNotesDialog session={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
