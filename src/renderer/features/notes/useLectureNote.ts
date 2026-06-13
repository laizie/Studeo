import { format } from 'date-fns';
import { useCreateNote } from '../../lib/queries/useNotes';
import { useCreateNoteLink } from '../../lib/queries/useNoteLinks';
import { lectureTemplate } from '../../../shared/noteTemplates';
import { parseDateLocal } from '../../../shared/deadlines';

export interface LectureNoteSpec {
  courseId: string;
  courseAbbrev: string;
  meetingId: string;
  date: string; // YYYY-MM-DD
}

/**
 * Creates a lecture note for a dated session: pre-filled with the lecture template, dated,
 * and linked to BOTH the course (so it shows in the notebook) and the dated lecture
 * occurrence (so it shows on the calendar). Returns the new note id. Shared by the class
 * notebook's "＋ Lecture note" and quick-capture.
 */
export function useCreateLectureNote() {
  const createNote = useCreateNote();
  const linkNote = useCreateNoteLink();

  return async function createLectureNote(spec: LectureNoteSpec): Promise<string> {
    const pretty = format(parseDateLocal(spec.date), 'EEE, MMM d');
    const note = await createNote.mutateAsync({
      title: `${spec.courseAbbrev} · Lecture ${pretty}`,
      contentJson: lectureTemplate(),
      noteDate: spec.date,
    });
    await linkNote.mutateAsync({ noteId: note.id, entityType: 'course', entityId: spec.courseId });
    await linkNote.mutateAsync({
      noteId: note.id,
      entityType: 'class_meeting',
      entityId: spec.meetingId,
      occurrenceDate: spec.date,
    });
    return note.id;
  };
}
