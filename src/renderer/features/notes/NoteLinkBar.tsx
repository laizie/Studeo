import { BookOpen, ClipboardList, CalendarDays, Timer, CalendarRange, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NoteLink } from '../../../shared/types';
import { useNoteLinks, useDeleteNoteLink } from '../../lib/queries/useNoteLinks';
import { useCourses } from '../../lib/queries/useCourses';
import { useAssignments } from '../../lib/queries/useAssignments';

const ENTITY_ICON: Record<NoteLink['entity_type'], LucideIcon> = {
  course: BookOpen,
  assignment: ClipboardList,
  class_meeting: CalendarDays,
  study_session: Timer,
  term: CalendarRange,
};

/**
 * The bar of context chips under a note's title: what this note is attached to. Labels are
 * resolved from already-cached app data (courses/assignments) rather than re-fetched. Each
 * chip can be detached; the note itself is untouched.
 */
export default function NoteLinkBar({ noteId }: { noteId: string }) {
  const { data: links } = useNoteLinks(noteId);
  const { data: courses } = useCourses();
  const { data: assignments } = useAssignments();
  const deleteLink = useDeleteNoteLink();

  if (!links || links.length === 0) return null;

  function label(link: NoteLink): string {
    switch (link.entity_type) {
      case 'course':
        return courses?.find((c) => c.id === link.entity_id)?.abbreviation ?? 'Course';
      case 'assignment':
        return assignments?.find((a) => a.id === link.entity_id)?.name ?? 'Assignment';
      case 'class_meeting':
        return link.occurrence_date ? `Lecture · ${link.occurrence_date}` : 'Lecture';
      case 'study_session':
        return 'Study session';
      case 'term':
        return 'Semester';
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {links.map((link) => {
        const Icon = ENTITY_ICON[link.entity_type];
        return (
          <span
            key={link.id}
            className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-inset py-1 pl-2.5 pr-1.5 text-xs text-ink-soft"
          >
            <Icon size={12} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="max-w-[180px] truncate">{label(link)}</span>
            <button
              onClick={() => deleteLink.mutate(link.id)}
              aria-label={`Remove ${label(link)} link`}
              className="rounded-full p-0.5 text-muted hover:bg-surface-hi hover:text-ink transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
