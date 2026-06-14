import { useEffect } from 'react';
import { X, FileText, NotebookPen, Columns2, BookOpen, GraduationCap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NOTE_TEMPLATES, type TemplateId } from '../../../shared/noteTemplates';

const ICONS: Record<TemplateId, LucideIcon> = {
  blank: FileText,
  lecture: NotebookPen,
  cornell: Columns2,
  reading: BookOpen,
  studyGuide: GraduationCap,
};

interface Props {
  onPick: (id: TemplateId) => void;
  onClose: () => void;
}

/** Choose a starting template when creating a note. */
export default function TemplatePickerDialog({ onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[16vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-sm mx-4 overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">New note</h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="py-1">
          {NOTE_TEMPLATES.map((t) => {
            const Icon = ICONS[t.id];
            return (
              <button
                key={t.id}
                onClick={() => onPick(t.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hi transition-colors"
              >
                <Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{t.label}</span>
                  <span className="block text-xs text-muted">{t.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
