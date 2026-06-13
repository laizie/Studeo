import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText } from 'lucide-react';
import { useNotes, useSearchNotes } from '../lib/queries/useNotes';
import { cn } from '../lib/utils';
import type { Note } from '../../shared/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function snippet(note: Note): string {
  const text = note.content_text.trim().replace(/\n+/g, ' ');
  return text.length > 80 ? text.slice(0, 80).trimEnd() + '…' : text;
}

/** ⌘K palette to jump to any note by title/content (FTS); recent notes when the box is empty. */
export default function CommandPalette({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const trimmed = query.trim();

  const recent = useNotes();
  const search = useSearchNotes(trimmed);
  const results: Note[] = ((trimmed ? search.data : recent.data) ?? []).slice(0, 8);

  // Reset and focus on open; keep the highlighted row in range as results change.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);
  useEffect(() => setIndex(0), [query]);

  if (!isOpen) return null;

  function openNote(note: Note) {
    onClose();
    navigate(`/notes/${note.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[index]) openNote(results[index]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[16vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg mx-4 overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="relative border-b border-line">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search notes…"
            aria-label="Search notes"
            className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              {trimmed ? `No notes match “${trimmed}”.` : 'No notes yet.'}
            </p>
          ) : (
            <>
              {!trimmed && (
                <p className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">Recent</p>
              )}
              {results.map((note, i) => (
                <button
                  key={note.id}
                  onClick={() => openNote(note)}
                  onMouseEnter={() => setIndex(i)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
                    i === index ? 'bg-surface-hi' : 'hover:bg-surface-hi',
                  )}
                >
                  <FileText size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{note.title || 'Untitled'}</span>
                    {snippet(note) && <span className="block truncate text-xs text-muted">{snippet(note)}</span>}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span>↑↓ to navigate</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
