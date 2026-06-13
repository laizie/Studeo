import { useEffect } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import type { ClassMeeting, Course } from '../../../shared/types';
import EntityNotesList from './EntityNotesList';

interface Props {
  meeting: ClassMeeting;
  course?: Course;
  /** The dated lecture occurrence (YYYY-MM-DD). */
  date: string;
  onClose: () => void;
}

/** Notes for one dated lecture, opened from a calendar event. Notes are scoped to this
    meeting + date, so each class session has its own page. */
export default function LectureNotesDialog({ meeting, course, date, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const prettyDate = format(new Date(`${date}T00:00`), 'EEE, MMM d');
  const abbrev = course?.abbreviation ?? 'Lecture';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative max-h-[88vh] w-full max-w-md mx-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            {abbrev} <span className="text-muted font-normal">· {prettyDate}</span>
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <EntityNotesList
          entityType="class_meeting"
          entityId={meeting.id}
          occurrenceDate={date}
          newNoteTitle={`${abbrev} ${prettyDate} — `}
          heading="Lecture notes"
        />
      </div>
    </div>
  );
}
