import { useNavigate, Link } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Note, NoteLinkEntity } from '../../../shared/types';
import { useCreateNote } from '../../lib/queries/useNotes';
import { useEntityNotes, useCreateNoteLink } from '../../lib/queries/useNoteLinks';

interface Props {
  entityType: NoteLinkEntity;
  entityId: string;
  /** For class_meeting embeds: pin new notes to one dated lecture. */
  occurrenceDate?: string;
  /** Prefilled title for newly created notes, e.g. "BIO 101 — ". */
  newNoteTitle?: string;
  heading?: string;
}

function snippet(note: Note): string {
  const text = note.content_text.trim();
  if (!text) return 'Empty note';
  return text.length > 100 ? text.slice(0, 100).trimEnd() + '…' : text;
}

/**
 * Embeddable list of the notes attached to one entity (course, assignment, lecture, …),
 * with a "New note" action that creates a note, links it to this entity, and opens it.
 * The same component powers every per-entity surface so they stay consistent.
 */
export default function EntityNotesList({
  entityType,
  entityId,
  occurrenceDate,
  newNoteTitle,
  heading = 'Notes',
}: Props) {
  const navigate = useNavigate();
  const { data: notes } = useEntityNotes(entityType, entityId);
  const createNote = useCreateNote();
  const linkNote = useCreateNoteLink();
  const pending = createNote.isPending || linkNote.isPending;

  async function handleNew() {
    const note = await createNote.mutateAsync({ title: newNoteTitle ?? '' });
    await linkNote.mutateAsync({ noteId: note.id, entityType, entityId, occurrenceDate });
    navigate(`/notes/${note.id}`);
  }

  const list = notes ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink-soft">{heading}</h2>
        <button
          onClick={handleNew}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-ink hover:bg-accent-deep transition-colors disabled:opacity-60"
        >
          <Plus size={14} />
          New note
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface py-10 text-center">
          <FileText size={22} className="mx-auto mb-2 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">No notes here yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((note) => (
            <Link
              key={note.id}
              to={`/notes/${note.id}`}
              className="block rounded-xl border border-line bg-surface px-4 py-3 hover:bg-surface-hi transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate font-medium text-ink">{note.title || 'Untitled'}</h3>
                <span className="shrink-0 text-xs text-muted">
                  {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{snippet(note)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
