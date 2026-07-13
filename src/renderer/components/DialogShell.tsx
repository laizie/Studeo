import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../lib/useFocusTrap';
import { cn } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Dialog heading — rendered as the h2 and announced when the dialog opens. */
  title: string;
  /** Tailwind max-width class for the panel (default matches the form dialogs). */
  maxWidth?: string;
  children: ReactNode;
}

/**
 * Shared modal wrapper: overlay, panel, heading, labeled close button, Esc to
 * close, focus trap, focus restore, and initial focus. Every form dialog
 * composes this, so keyboard and screen-reader correctness is the default
 * rather than per-dialog effort. (ConfirmDialog keeps its own two-button trap;
 * QuickAddDialog keeps its tab-switcher header — both already meet the bar.)
 */
export default function DialogShell({ isOpen, onClose, title, maxWidth = 'max-w-md', children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(isOpen, panelRef);

  useEffect(() => {
    if (!isOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);

    // If the dialog's own content didn't claim focus (most forms autofocus a
    // field), put it on the first focusable element so Tab starts inside.
    const claim = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      panel
        .querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
        )
        ?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(claim);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 animate-fade" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative mx-4 max-h-[85vh] w-full overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl animate-pop',
          maxWidth,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-muted transition-colors hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
