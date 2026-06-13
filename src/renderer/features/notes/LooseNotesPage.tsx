import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useLooseNotes, useCreateNote } from '../../lib/queries/useNotes';
import QueryErrorState from '../../components/QueryErrorState';
import type { Note } from '../../../shared/types';

function snippet(note: Note): string {
  const text = note.content_text.trim().replace(/\n+/g, ' ');
  if (!text) return 'Empty note';
  return text.length > 140 ? text.slice(0, 140).trimEnd() + '…' : text;
}

/** Notes not attached to any class. Global search lives in the ⌘K palette. */
export default function LooseNotesPage() {
  const navigate = useNavigate();
  const { data: notes, isError, refetch } = useLooseNotes();
  const createNote = useCreateNote();

  function handleNew() {
    createNote.mutate({}, { onSuccess: (note) => navigate(`/notes/${note.id}`) });
  }

  const list = notes ?? [];

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

      {!isError && list.length > 0 && (
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
