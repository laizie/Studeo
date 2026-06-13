import { useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pin, FileText, Star, CalendarDays } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useCourse } from '../../lib/queries/useCourses';
import { useTerms } from '../../lib/queries/useTerms';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useMeetingExceptions } from '../../lib/queries/useMeetingExceptions';
import { useCreateNote } from '../../lib/queries/useNotes';
import { useEntityNotes, useCreateNoteLink, useSetNotePin } from '../../lib/queries/useNoteLinks';
import { bucketByWeek, expandClassSessions, type ClassSession } from '../../../shared/notebook';
import { buildExceptionIndex } from '../../../shared/meetingExceptions';
import { useCreateLectureNote } from './useLectureNote';
import { parseDateLocal, formatDueDate } from '../../../shared/deadlines';
import { cn } from '../../lib/utils';
import type { EntityNote } from '../../../shared/types';

type TimelineEntry =
  | { kind: 'session'; date: string; session: ClassSession; notes: EntityNote[] }
  | { kind: 'note'; date: string; note: EntityNote };

function snippet(note: EntityNote): string {
  const text = note.content_text.trim().replace(/\n+/g, ' ');
  if (!text) return 'Empty note';
  return text.length > 100 ? text.slice(0, 100).trimEnd() + '…' : text;
}

function NoteRow({
  note,
  onPin,
  showDate,
}: {
  note: EntityNote;
  onPin: (note: EntityNote) => void;
  showDate?: boolean;
}) {
  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-xl border px-4 py-3 transition-colors',
        note.is_pinned ? 'border-accent/40 bg-surface' : 'border-line bg-surface hover:bg-surface-hi',
      )}
    >
      <Link to={`/notes/${note.id}`} className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate font-medium text-ink">{note.title || 'Untitled'}</h3>
          <span className="shrink-0 text-xs text-muted">
            {showDate && note.note_date
              ? formatDueDate(note.note_date)
              : formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{snippet(note)}</p>
      </Link>
      <button
        onClick={() => onPin(note)}
        title={note.is_pinned ? 'Unpin' : 'Pin to top'}
        aria-label={note.is_pinned ? 'Unpin note' : 'Pin note to top'}
        className={cn(
          'mt-0.5 shrink-0 rounded-md p-1 transition-colors',
          note.is_pinned
            ? 'text-accent'
            : 'text-muted opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Pin size={14} className={note.is_pinned ? 'fill-current' : ''} />
      </button>
    </div>
  );
}

export default function ClassNotebookPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { data: course } = useCourse(courseId ?? '');
  const { data: terms } = useTerms();
  const { data: meetings } = useClassMeetings({ courseId });
  const { data: exceptions } = useMeetingExceptions();
  const { data: notes } = useEntityNotes('course', courseId);
  const createNote = useCreateNote();
  const linkNote = useCreateNoteLink();
  const setPin = useSetNotePin();
  const createLectureNote = useCreateLectureNote();

  const term = terms?.find((t) => t.id === course?.term_id);
  const termStart = term?.start_date ?? null;
  const termEnd = term?.end_date ?? null;

  const all = notes ?? [];
  const pinned = all.filter((n) => n.is_pinned);
  const datedNotes = all.filter((n) => !n.is_pinned && n.note_date);
  const pages = all.filter((n) => !n.is_pinned && !n.note_date);

  // Merge real class sessions (from the schedule) with any other dated notes into one
  // chronological timeline, then bucket into weeks.
  const exIndex = useMemo(() => buildExceptionIndex(exceptions ?? []), [exceptions]);
  const weeks = useMemo(() => {
    const sessions = expandClassSessions(termStart, termEnd, meetings ?? [], exIndex);
    const sessionDates = new Set(sessions.map((s) => s.date));
    const notesByDate = new Map<string, EntityNote[]>();
    for (const n of datedNotes) {
      const arr = notesByDate.get(n.note_date as string) ?? [];
      arr.push(n);
      notesByDate.set(n.note_date as string, arr);
    }
    const entries: TimelineEntry[] = [
      ...sessions.map((s): TimelineEntry => ({ kind: 'session', date: s.date, session: s, notes: notesByDate.get(s.date) ?? [] })),
      ...datedNotes
        .filter((n) => !sessionDates.has(n.note_date as string))
        .map((n): TimelineEntry => ({ kind: 'note', date: n.note_date as string, note: n })),
    ];
    return bucketByWeek(termStart, entries, (e) => e.date);
  }, [termStart, termEnd, meetings, exIndex, datedNotes]);

  function togglePin(note: EntityNote) {
    setPin.mutate({ linkId: note.link_id, pinned: !note.is_pinned });
  }

  async function newNote(opts: { pinned?: boolean; title?: string } = {}) {
    const note = await createNote.mutateAsync({ title: opts.title ?? `${course?.abbreviation ?? ''} — ` });
    const link = await linkNote.mutateAsync({ noteId: note.id, entityType: 'course', entityId: courseId! });
    if (opts.pinned) await setPin.mutateAsync({ linkId: link.id, pinned: true });
    navigate(`/notes/${note.id}`);
  }

  // One-click lecture note for a specific session (dated + linked to course and occurrence).
  async function addLectureNote(session: ClassSession) {
    const id = await createLectureNote({
      courseId: courseId!,
      courseAbbrev: course?.abbreviation ?? '',
      meetingId: session.meetingId,
      date: session.date,
    });
    navigate(`/notes/${id}`);
  }

  if (!course) {
    return (
      <div className="p-8">
        <Link to="/notes" className="text-sm text-muted hover:text-ink">← Notebooks</Link>
        <p className="mt-4 text-sm text-muted">Class not found.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link
        to="/notes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={15} />
        Notebooks
      </Link>

      <div className="mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-ink">{course.name}</h1>
            <p className="text-sm text-muted">{course.abbreviation} · Notebook</p>
          </div>
        </div>
        <button
          onClick={() => newNote()}
          disabled={createNote.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-ink hover:bg-accent-deep transition-colors disabled:opacity-60"
        >
          <Plus size={15} />
          New note
        </button>
      </div>

      {/* ── Course home ──────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Star size={13} /> Course home
        </h2>
        {pinned.length === 0 ? (
          <button
            onClick={() => newNote({ pinned: true, title: `${course.abbreviation} — Overview` })}
            className="w-full rounded-xl border border-dashed border-line py-4 text-sm text-muted hover:bg-surface-hi hover:text-ink transition-colors"
          >
            ＋ Create a course home page
          </button>
        ) : (
          <div className="space-y-2">
            {pinned.map((n) => <NoteRow key={n.id} note={n} onPin={togglePin} />)}
          </div>
        )}
      </section>

      {/* ── Timeline ─────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <CalendarDays size={13} /> Timeline
        </h2>
        {weeks.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
            {termStart
              ? 'Your class sessions appear here by week once the course has a schedule and term dates.'
              : 'Set start/end dates on this term (Settings → Semesters) to see your class sessions by week.'}
          </p>
        ) : (
          <div className="space-y-5">
            {weeks.map((w) => (
              <div key={w.weekNumber}>
                <p className="mb-2 text-sm font-medium text-ink-soft">
                  Week {w.weekNumber}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {formatDueDate(w.start)} – {formatDueDate(w.end)}
                  </span>
                </p>
                <div className="space-y-2">
                  {w.items.map((entry) =>
                    entry.kind === 'note' ? (
                      <NoteRow key={entry.note.id} note={entry.note} onPin={togglePin} showDate />
                    ) : (
                      <div key={`${entry.session.meetingId}:${entry.date}`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-muted">
                            {format(parseDateLocal(entry.date), 'EEE, MMM d')} · {entry.session.startTime}
                          </span>
                          <button
                            onClick={() => addLectureNote(entry.session)}
                            disabled={createNote.isPending}
                            className="text-xs text-accent hover:underline disabled:opacity-50"
                          >
                            ＋ Lecture note
                          </button>
                        </div>
                        {entry.notes.length === 0 ? (
                          <button
                            onClick={() => addLectureNote(entry.session)}
                            disabled={createNote.isPending}
                            className="w-full rounded-lg border border-dashed border-line px-3 py-2 text-left text-xs text-muted hover:bg-surface-hi hover:text-ink transition-colors disabled:opacity-50"
                          >
                            No notes for this session yet — add one
                          </button>
                        ) : (
                          <div className="space-y-2">
                            {entry.notes.map((n) => <NoteRow key={n.id} note={n} onPin={togglePin} />)}
                          </div>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Pages ────────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <FileText size={13} /> Pages
        </h2>
        {pages.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
            Undated notes — labs, projects, study guides — live here.
          </p>
        ) : (
          <div className="space-y-2">
            {pages.map((n) => <NoteRow key={n.id} note={n} onPin={togglePin} />)}
          </div>
        )}
      </section>
    </div>
  );
}
