import { useEffect } from 'react';
import { X, History } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { NoteVersion } from '../../../shared/types';
import { blocksToPlainText } from '../../../shared/notes';
import { useNoteVersions } from '../../lib/queries/useNotes';

interface Props {
  noteId: string;
  restoringId: string | null;
  onRestore: (version: NoteVersion) => void;
  onClose: () => void;
}

function preview(version: NoteVersion): string {
  const text = blocksToPlainText(version.content_json).trim().replace(/\n+/g, ' ');
  if (!text) return 'Empty document';
  return text.length > 90 ? text.slice(0, 90).trimEnd() + '…' : text;
}

/** Lists a note's saved snapshots and restores the chosen one. */
export default function VersionHistoryDialog({ noteId, restoringId, onRestore, onClose }: Props) {
  const { data: versions, isLoading } = useNoteVersions(noteId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = versions ?? [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-md mx-4 overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <History size={15} className="text-muted" />
            Version history
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-6 text-sm text-muted">Loading…</p>
          ) : list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No earlier versions yet. Snapshots are saved automatically as you edit.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((v) => (
                <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink" title={format(new Date(v.created_at), 'PPpp')}>
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{preview(v)}</p>
                  </div>
                  <button
                    onClick={() => onRestore(v)}
                    disabled={restoringId !== null}
                    className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-ink-soft hover:bg-surface-hi disabled:opacity-50 transition-colors"
                  >
                    {restoringId === v.id ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
