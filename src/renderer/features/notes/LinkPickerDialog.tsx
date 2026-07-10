import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';

export interface PickItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  title: string;
  items: PickItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Small searchable single-select list, used by the editor's /Link slash commands. */
export default function LinkPickerDialog({ title, items, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => `${i.label} ${i.sublabel ?? ''}`.toLowerCase().includes(q))
    : items;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[18vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" />
      <div className="relative w-full max-w-sm mx-4 overflow-hidden rounded-2xl bg-surface shadow-2xl animate-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
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
            placeholder="Search…"
            className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Nothing to link.</p>
          ) : (
            filtered.map((i) => (
              <button
                key={i.id}
                onClick={() => onSelect(i.id)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-surface-hi transition-colors"
              >
                <span className="truncate text-sm text-ink">{i.label}</span>
                {i.sublabel && <span className="ml-auto shrink-0 text-xs text-muted">{i.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
