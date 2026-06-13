import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Search, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNotes, useSearchNotes, useCreateNote } from '../../lib/queries/useNotes';
import QueryErrorState from '../../components/QueryErrorState';
import type { Note } from '../../../shared/types';

function snippet(note: Note): string {
  const text = note.content_text.trim();
  if (!text) return 'Empty note';
  return text.length > 140 ? text.slice(0, 140).trimEnd() + '…' : text;
}

function NoteRow({ note }: { note: Note }) {
  return (
    <Link
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
  );
}

export default function NotesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  const list = useNotes();
  const search = useSearchNotes(trimmed);
  const createNote = useCreateNote();

  // When searching, show search results; otherwise the full (newest-first) list.
  const active = isSearching ? search : list;
  const notes = active.data ?? [];

  function handleCreate() {
    createNote.mutate(
      {},
      { onSuccess: (note) => navigate(`/notes/${note.id}`) },
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Notes</h1>
          <p className="mt-0.5 text-sm text-muted">
            {list.data ? `${list.data.length} ${list.data.length === 1 ? 'note' : 'notes'}` : ' '}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={createNote.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-ink hover:bg-accent-deep transition-colors disabled:opacity-60"
        >
          <Plus size={15} />
          New note
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="w-full rounded-lg border border-line bg-inset py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {active.isError && <QueryErrorState message="Couldn't load your notes." onRetry={active.refetch} />}

      {!active.isError && notes.length === 0 && (
        <div className="py-20 text-center">
          <FileText size={28} className="mx-auto mb-3 text-muted" aria-hidden="true" />
          {isSearching ? (
            <>
              <h2 className="text-base font-semibold text-ink">No matches</h2>
              <p className="mt-1 text-sm text-muted">Nothing matches “{trimmed}”.</p>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-ink">No notes yet</h2>
              <p className="mt-1 text-sm text-muted">Capture lecture notes, build a course wiki, or draft an essay.</p>
              <button
                onClick={handleCreate}
                disabled={createNote.isPending}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-ink hover:bg-accent-deep transition-colors disabled:opacity-60"
              >
                <Plus size={15} />
                New note
              </button>
            </>
          )}
        </div>
      )}

      {!active.isError && notes.length > 0 && (
        <div className="space-y-2">
          {notes.map((note) => (
            <NoteRow key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
