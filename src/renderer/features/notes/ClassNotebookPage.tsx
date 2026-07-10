import { useMemo, useState, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, CalendarDays, Trash2, Pin, Clock, ClipboardList, List, LayoutGrid } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '../../lib/utils';
import { useCourse } from '../../lib/queries/useCourses';
import { useTerms } from '../../lib/queries/useTerms';
import { useClassMeetings } from '../../lib/queries/useClassMeetings';
import { useMeetingExceptions } from '../../lib/queries/useMeetingExceptions';
import { useAssignments } from '../../lib/queries/useAssignments';
import { useCreateNote, useDeleteNote } from '../../lib/queries/useNotes';
import { useEntityNotes, useCreateNoteLink, useSetNotePin } from '../../lib/queries/useNoteLinks';
import { bucketByWeek, groupByMonth, expandClassSessions, type ClassSession } from '../../../shared/notebook';
import { buildExceptionIndex } from '../../../shared/meetingExceptions';
import { useCreateLectureNote } from './useLectureNote';
import TemplatePickerDialog from './TemplatePickerDialog';
import { templateContent, type TemplateId } from '../../../shared/noteTemplates';
import { parseDateLocal, formatDueDate, computeDeadlineLabel } from '../../../shared/deadlines';
import { URGENCY_CLASS } from '../../lib/urgency';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { Assignment, ClassMeeting, EntityNote } from '../../../shared/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A bordered card used for the right-rail context panels (Schedule, Upcoming).
function SidePanel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

type TimelineEntry =
  | { kind: 'session'; date: string; session: ClassSession; notes: EntityNote[] }
  | { kind: 'note'; date: string; note: EntityNote };

// The three lenses on a class's notes. 'timeline' keeps the term-anchored weeks + sessions;
// 'list' is a flat newest-first scan; 'board' lays notes out in month columns.
type NotebookView = 'timeline' | 'list' | 'board';

// Segmented control to switch between the notebook views. One button per view; the active
// one fills with the accent color, matching the calm light theme used elsewhere.
function ViewToggle({ view, onChange }: { view: NotebookView; onChange: (v: NotebookView) => void }) {
  const options: { id: NotebookView; label: string; icon: ReactNode }[] = [
    { id: 'timeline', label: 'Timeline', icon: <CalendarDays size={14} /> },
    { id: 'list', label: 'List', icon: <List size={14} /> },
    { id: 'board', label: 'Board', icon: <LayoutGrid size={14} /> },
  ];
  return (
    <div role="tablist" aria-label="Notebook view" className="inline-flex gap-0.5 rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => {
        const active = o.id === view;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface-hi hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function snippet(note: EntityNote): string {
  const text = note.content_text.trim().replace(/\n+/g, ' ');
  if (!text) return 'Empty note';
  return text.length > 100 ? text.slice(0, 100).trimEnd() + '…' : text;
}

function NoteRow({
  note,
  showDate,
  onTogglePin,
  onDelete,
}: {
  note: EntityNote;
  showDate?: boolean;
  onTogglePin: (note: EntityNote) => void;
  onDelete: (note: EntityNote) => void;
}) {
  const pinned = note.is_pinned === 1;
  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-xl border px-4 py-3 transition-colors',
        pinned ? 'border-accent/40 bg-surface' : 'border-line bg-surface hover:bg-surface-hi',
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
        onClick={() => onTogglePin(note)}
        title={pinned ? 'Unpin from this class' : 'Pin to top of this class'}
        aria-label={pinned ? 'Unpin note' : 'Pin note to top'}
        className={cn(
          'mt-0.5 shrink-0 rounded-md p-1 transition focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          pinned
            ? 'text-accent'
            : 'text-muted opacity-0 hover:text-ink group-hover:opacity-100',
        )}
      >
        <Pin size={14} className={pinned ? 'fill-current' : ''} />
      </button>
      <button
        onClick={() => onDelete(note)}
        title="Delete note"
        aria-label="Delete note"
        className="mt-0.5 shrink-0 rounded-md p-1 text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <Trash2 size={14} />
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
  const { data: assignments } = useAssignments({ courseId });
  const { data: notes } = useEntityNotes('course', courseId);
  const createNote = useCreateNote();
  const linkNote = useCreateNoteLink();
  const createLectureNote = useCreateLectureNote();
  const setPin = useSetNotePin();
  const deleteNote = useDeleteNote();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EntityNote | null>(null);
  const [view, setView] = useState<NotebookView>('timeline');

  const term = terms?.find((t) => t.id === course?.term_id);
  const termStart = term?.start_date ?? null;
  const termEnd = term?.end_date ?? null;

  // Pinned notes lift to a section at the top (per-class pin, via note_links). The rest
  // split as before: dated notes on the Timeline, undated ones in freeform Pages.
  const all = notes ?? [];
  const pinnedNotes = all.filter((n) => n.is_pinned === 1);
  const datedNotes = all.filter((n) => n.note_date && n.is_pinned !== 1);
  const pages = all.filter((n) => !n.note_date && n.is_pinned !== 1);

  // List + Board lenses both work off the same set: every non-pinned note (dated or not).
  // List shows it flat, newest-edited first; Board buckets it into months by note_date,
  // falling back to updated_at for undated notes so nothing is dropped.
  const unpinned = all.filter((n) => n.is_pinned !== 1);
  const listNotes = [...unpinned].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const monthGroups = groupByMonth(unpinned, (n) => n.note_date ?? n.updated_at);

  function togglePin(note: EntityNote) {
    setPin.mutate({ linkId: note.link_id, pinned: note.is_pinned !== 1 });
  }

  // Right-rail context. Meetings sorted into weekday order; assignments narrowed to the
  // next few still-open ones (soonest first) so the panel stays a glanceable summary.
  const schedule = [...(meetings ?? [])].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
  const upcoming = (assignments ?? [])
    .filter((a) => a.status !== 'completed')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

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

  async function newNote(opts: { title?: string; templateId?: TemplateId } = {}) {
    const note = await createNote.mutateAsync({
      title: opts.title ?? format(new Date(), 'MM/dd/yy'),
      contentJson: templateContent(opts.templateId ?? 'blank'),
    });
    await linkNote.mutateAsync({ noteId: note.id, entityType: 'course', entityId: courseId! });
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
          onClick={() => setTemplateOpen(true)}
          disabled={createNote.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-ink hover:bg-accent-deep active:scale-[0.98] transition-colors disabled:opacity-60"
        >
          <Plus size={15} />
          New note
        </button>
      </div>

      {templateOpen && (
        <TemplatePickerDialog
          onPick={(id) => { setTemplateOpen(false); newNote({ templateId: id }); }}
          onClose={() => setTemplateOpen(false)}
        />
      )}

      <div className="flex items-start gap-8">
        {/* Main column: the note lists (Pinned, Timeline, Pages). */}
        <div className="min-w-0 flex-1">

      {/* ── Pinned ───────────────────────────────────────────────────────────── */}
      {pinnedNotes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Pin size={13} /> Pinned
          </h2>
          <div className="space-y-2">
            {pinnedNotes.map((n) => (
              <NoteRow key={n.id} note={n} showDate onTogglePin={togglePin} onDelete={setPendingDelete} />
            ))}
          </div>
        </section>
      )}

      {/* View switcher — governs everything below it (Pinned stays lifted above). */}
      <div className="mb-6">
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* ── Timeline view ────────────────────────────────────────────────────── */}
      {view === 'timeline' && (
        <>
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
                      <NoteRow key={entry.note.id} note={entry.note} showDate onTogglePin={togglePin} onDelete={setPendingDelete} />
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
                            {entry.notes.map((n) => <NoteRow key={n.id} note={n} onTogglePin={togglePin} onDelete={setPendingDelete} />)}
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
            {pages.map((n) => <NoteRow key={n.id} note={n} onTogglePin={togglePin} onDelete={setPendingDelete} />)}
          </div>
        )}
      </section>
        </>
      )}

      {/* ── List view ────────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <section>
          {listNotes.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
              No notes in this class yet. Use “New note” to start one.
            </p>
          ) : (
            <div className="space-y-2">
              {listNotes.map((n) => (
                <NoteRow key={n.id} note={n} showDate onTogglePin={togglePin} onDelete={setPendingDelete} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Board view ───────────────────────────────────────────────────────── */}
      {view === 'board' && (
        <section>
          {monthGroups.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
              No notes in this class yet. Use “New note” to start one.
            </p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {monthGroups.map((m) => (
                <div key={m.key} className="flex w-72 shrink-0 flex-col">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-ink-soft">{m.label}</h3>
                    <span className="text-xs text-muted">{m.items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {m.items.map((n) => (
                      <NoteRow key={n.id} note={n} showDate onTogglePin={togglePin} onDelete={setPendingDelete} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

        </div>

        {/* Right rail: at-a-glance course context. Hidden on narrow windows so the note
            lists keep the full width when there's no room for two columns. */}
        <aside className="hidden w-72 shrink-0 space-y-6 lg:block">
          <SidePanel icon={<Clock size={13} />} title="Schedule">
            {schedule.length === 0 ? (
              <p className="text-sm text-muted">No class times set.</p>
            ) : (
              <ul className="space-y-2">
                {schedule.map((m: ClassMeeting) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-ink">{DAY_LABELS[m.day_of_week]}</span>
                    <span className="text-muted">
                      {m.start_time}–{m.end_time}
                      {m.location ? ` · ${m.location}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

          <SidePanel icon={<ClipboardList size={13} />} title="Upcoming">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">Nothing due. 🎉</p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((a: Assignment) => {
                  const deadline = computeDeadlineLabel(a.due_date);
                  return (
                    <li key={a.id} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-ink">{a.name}</span>
                      <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-medium', URGENCY_CLASS[deadline.urgency])}>
                        {deadline.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SidePanel>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Delete note?"
        message="This permanently deletes the note."
        onConfirm={() => { if (pendingDelete) deleteNote.mutate(pendingDelete.id); }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
