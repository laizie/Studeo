import { useState, useEffect } from 'react';
import { X, Search, Check } from 'lucide-react';
import { useNotes } from '../../lib/queries/useNotes';
import { cn } from '../../lib/utils';
import type { Note } from '../../../shared/types';

interface Props {
  /** The current note — excluded so a study guide can't link to itself. */
  excludeId?: string;
  onInsert: (notes: Note[]) => void;
  onClose: () => void;
}

/** Multi-select picker for inserting links to other notes (study guides / exam review). */
export default function NotePickerDialog({ excludeId, onInsert, onClose }: Props) {
  const { data: notes } = useNotes();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const all = (notes ?? []).filter((n) => n.id !== excludeId);
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter((n) => `${n.title} ${n.content_text}`.toLowerCase().includes(q)) : all;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function insert() {
    onInsert(all.filter((n) => selected.has(n.id)));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" />
      <div className="relative flex max-h-[70vh] w-full max-w-md mx-4 flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl animate-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Link notes</h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="relative border-b border-line">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">No notes to link.</p>
          ) : (
            filtered.map((n) => {
              const on = selected.has(n.id);
              return (
                <button
                  key={n.id}
                  onClick={() => toggle(n.id)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-hi transition-colors"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      on ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                    )}
                  >
                    {on && <Check size={12} />}
                  </span>
                  <span className="truncate text-sm text-ink">{n.title || 'Untitled'}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-muted hover:text-ink transition-colors">
            Cancel
          </button>
          <button
            onClick={insert}
            disabled={selected.size === 0}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-ink hover:bg-accent-deep active:scale-[0.98] disabled:opacity-50 transition-colors"
          >
            Insert {selected.size > 0 ? `${selected.size} ` : ''}link{selected.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
