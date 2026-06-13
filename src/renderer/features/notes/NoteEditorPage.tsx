import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useNote, useDeleteNote } from '../../lib/queries/useNotes';
import QueryErrorState from '../../components/QueryErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';
import NoteEditor from './NoteEditor';

export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: note, isLoading, isError, refetch } = useNote(id);
  const deleteNote = useDeleteNote();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    if (!id) return;
    deleteNote.mutate(id, { onSuccess: () => navigate('/notes') });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <Link
          to="/notes"
          className="flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft size={15} />
          All notes
        </Link>
        {note && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-hi hover:text-ink transition-colors"
            title="Delete note"
          >
            <Trash2 size={15} />
            Delete
          </button>
        )}
      </header>

      <div className="flex-1 overflow-auto bg-bg">
        {isLoading && <div className="p-10 text-muted">Loading…</div>}
        {isError && (
          <div className="p-10">
            <QueryErrorState message="Couldn't load this note." onRetry={refetch} />
          </div>
        )}
        {!isLoading && !isError && !note && (
          <div className="p-10 text-muted">
            This note doesn't exist. <Link to="/notes" className="text-accent underline">Back to notes</Link>
          </div>
        )}
        {note && <NoteEditor key={note.id} note={note} />}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete note?"
        message="This permanently deletes the note and any sub-pages under it."
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
