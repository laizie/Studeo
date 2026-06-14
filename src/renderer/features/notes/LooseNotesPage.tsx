import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, Pin, PinOff, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useLooseNotes, useCreateNote, useUpdateNote, useDeleteNote } from '../../lib/queries/useNotes';
import QueryErrorState from '../../components/QueryErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { Note } from '../../../shared/types';

function snippet(note: Note): string {
  const text = note.content_text.trim().replace(/\n+/g, ' ');
  if (!text) return 'Empty note';
  return text.length > 140 ? text.slice(0, 140).trimEnd() + '…' : text;
}

interface RowProps {
  note: Note;
  onTogglePin: (note: Note) => void;
  onDelete: (note: Note) => void;
}

/**
 * One note in the list. The card body is a Link to the editor; the pin/delete controls
 * sit beside it as real buttons (not nested in the Link, which would be invalid HTML).
 */
function NoteRow({ note, onTogglePin, onDelete }: RowProps) {
  const pinned = note.is_pinned === 1;
  return (
    <div className="group flex items-stretch gap-1 rounded-xl border border-line bg-surface hover:bg-surface-hi transition-colors">
      <Link to={`/notes/${note.id}`} className="min-w-0 flex-1 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate font-medium text-ink">{note.title || 'Untitled'}</h3>
          <span className="shrink-0 text-xs text-muted">
            {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{snippet(note)}</p>
      </Link>

      <div className="flex shrink-0 items-center gap-0.5 pr-2">
        <button
          onClick={() => onTogglePin(note)}
          className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-colors"
          title={pinned ? 'Unpin note' : 'Pin note'}
          aria-label={pinned ? 'Unpin note' : 'Pin note'}
        >
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        <button
          onClick={() => onDelete(note)}
          className="rounded-lg p-2 text-muted hover:bg-surface hover:text-red-600 transition-colors"
          title="Delete note"
          aria-label="Delete note"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

/** Notes not attached to any class. Global search lives in the ⌘K palette. */
export default function LooseNotesPage() {
  const navigate = useNavigate();
  const { data: notes, isError, refetch } = useLooseNotes();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);

  function handleNew() {
    createNote.mutate({}, { onSuccess: (note) => navigate(`/notes/${note.id}`) });
  }

  function togglePin(note: Note) {
    updateNote.mutate({ id: note.id, input: { pinned: note.is_pinned !== 1 } });
  }

  function confirmDelete() {
    if (pendingDelete) deleteNote.mutate(pendingDelete.id);
    setPendingDelete(null);
  }

  const list = notes ?? [];
  const pinned = list.filter((n) => n.is_pinned === 1);
  const others = list.filter((n) => n.is_pinned !== 1);

  return (
    <div className="p-8">
      <Link
        to="/notes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={15} />
        Notebooks
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Loose notes</h1>
          <p className="mt-0.5 text-sm text-muted">Quick notes not tied to a class</p>
        </div>
        <button
          onClick={handleNew}
          disabled={createNote.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-ink hover:bg-accent-deep transition-colors disabled:opacity-60"
        >
          <Plus size={15} />
          New note
        </button>
      </div>

      {isError && <QueryErrorState message="Couldn't load your notes." onRetry={refetch} />}

      {!isError && list.length === 0 && (
        <div className="py-20 text-center">
          <FileText size={28} className="mx-auto mb-3 text-muted" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">No loose notes</h2>
          <p className="mt-1 text-sm text-muted">Jot a quick thought, or open a class notebook to take lecture notes.</p>
        </div>
      )}

      {!isError && pinned.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Pin size={13} />
            Pinned
          </h2>
          <div className="space-y-2">
            {pinned.map((note) => (
              <NoteRow key={note.id} note={note} onTogglePin={togglePin} onDelete={setPendingDelete} />
            ))}
          </div>
        </section>
      )}

      {!isError && others.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">All notes</h2>
          )}
          <div className="space-y-2">
            {others.map((note) => (
              <NoteRow key={note.id} note={note} onTogglePin={togglePin} onDelete={setPendingDelete} />
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete note?"
        message="This permanently deletes the note."
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
