import { format } from 'date-fns';
import DialogShell from '../../components/DialogShell';
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
  const prettyDate = format(new Date(`${date}T00:00`), 'EEE, MMM d');
  const abbrev = course?.abbreviation ?? 'Lecture';

  return (
    <DialogShell isOpen onClose={onClose} title={`${abbrev} · ${prettyDate}`}>
      <EntityNotesList
        entityType="class_meeting"
        entityId={meeting.id}
        occurrenceDate={date}
        newNoteTitle={`${abbrev} ${prettyDate} — `}
        heading="Lecture notes"
      />
    </DialogShell>
  );
}
