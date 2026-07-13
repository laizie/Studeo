import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Pin, Clock, BookOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/utils';
import { contrastTextColor } from '../../lib/colors';
import { useCourses } from '../../lib/queries/useCourses';
import { useNotesWithCourse } from '../../lib/queries/useNotes';
import type { Course, NoteWithCourse } from '../../../shared/types';

function snippet(note: NoteWithCourse): string {
  const text = note.content_text.trim().replace(/\n+/g, ' ');
  if (!text) return 'Empty note';
  return text.length > 100 ? text.slice(0, 100).trimEnd() + '…' : text;
}

// A small heading used to separate the page's sections (Notebooks / Pinned / Recent).
function SectionHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
      {icon} {children}
    </h2>
  );
}

// One note as a card, color-coded by its class: a left accent bar in the course color
// plus the course abbreviation, so you can tell at a glance what a note was for. Notes
// with no class (loose) get a neutral bar and a "Loose note" label.
function NoteCard({ note, course }: { note: NoteWithCourse; course?: Course }) {
  return (
    <Link
      to={`/notes/${note.id}`}
      className="flex gap-3 rounded-xl border border-line bg-surface p-4 hover:bg-surface-hi transition-colors"
    >
      {/* Which-class is carried by the dot + abbreviation below — the old
          side bar doubled it and broke the system's side-stripe ban. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-medium text-ink">{note.title || 'Untitled'}</h3>
          <span className="shrink-0 text-xs text-muted">
            {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{snippet(note)}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', !course && 'bg-line')}
            style={course ? { backgroundColor: course.color } : undefined}
            aria-hidden="true"
          />
          <span className="truncate text-xs font-medium text-ink-soft">
            {course ? course.abbreviation : 'Loose note'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** The Notes front door: a notebook for each class, the Loose-notes bucket, plus quick
 *  ways back into recent and pinned notes. */
export default function NotebooksLandingPage() {
  const { data: courses } = useCourses();
  const { data: notes } = useNotesWithCourse();
  const list = courses ?? [];

  // Look up a note's course by id so each card can show its color/abbreviation.
  const courseById = new Map(list.map((c) => [c.id, c]));

  const all = notes ?? [];
  const pinned = all.filter((n) => n.is_pinned === 1);
  // "Recently edited" is the freshest handful, minus anything already shown under Pinned
  // so the two sections don't repeat the same note. notes.list() is sorted newest-first.
  const recent = all.filter((n) => n.is_pinned !== 1).slice(0, 6);

  return (
    <div className="p-8">
      <h1 className="mb-1 text-2xl font-semibold text-ink">Notes</h1>
      <p className="mb-8 text-sm text-muted">A notebook for each class. Press ⌘K to search notes — and everything else.</p>

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen size={19} className="text-ink-soft" />
          <h2 className="text-lg font-semibold text-ink">Class notebooks</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link
              key={c.id}
              to={`/notes/class/${c.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-7 transition-all hover:-translate-y-0.5 hover:border-transparent hover:bg-surface-hi hover:shadow-md"
            >
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: c.color, color: contrastTextColor(c.color) }}
                aria-hidden="true"
              >
                <BookOpen size={24} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink">{c.name}</p>
                <p className="mt-0.5 text-sm text-muted">{c.abbreviation}</p>
              </div>
            </Link>
          ))}

          <Link
            to="/notes/loose"
            className="group flex items-center gap-4 rounded-2xl border border-dashed border-line px-5 py-7 transition-all hover:-translate-y-0.5 hover:bg-surface-hi"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-inset text-muted" aria-hidden="true">
              <FileText size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">Loose notes</p>
              <p className="mt-0.5 text-sm text-muted">Not tied to a class</p>
            </div>
          </Link>
        </div>

        {list.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            Add a course to start a class notebook — or keep quick notes in Loose notes above.
          </p>
        )}
      </section>

      {(pinned.length > 0 || recent.length > 0) && (
        <div className="space-y-8 border-t border-line pt-8">
          {pinned.length > 0 && (
            <section>
              <SectionHeading icon={<Pin size={13} />}>Pinned notes</SectionHeading>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.map((n) => (
                  <NoteCard key={n.id} note={n} course={n.course_id ? courseById.get(n.course_id) : undefined} />
                ))}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section>
              <SectionHeading icon={<Clock size={13} />}>Recently edited notes</SectionHeading>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((n) => (
                  <NoteCard key={n.id} note={n} course={n.course_id ? courseById.get(n.course_id) : undefined} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
