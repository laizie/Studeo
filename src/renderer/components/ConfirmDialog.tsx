import { useEffect, useRef } from 'react';

interface Props {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Styled replacement for window.confirm(). Used for destructive actions, so
 * the confirm button is the red one and initial focus lands on Cancel (the
 * safe default). Focus is trapped between the two buttons while open and
 * returned to the triggering element on close.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: Props) {
  const cancelRef  = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Focus ownership, deliberately keyed on `isOpen` ALONE.
  //
  // This used to be one effect with [isOpen, onClose]. Every call site passes an inline
  // arrow (onClose={() => setConfirmOpen(false)}), which is a new function identity on
  // every render — so the effect tore down and re-ran whenever the parent re-rendered for
  // any reason at all (a React Query refetch, a mutation settling). Two things broke:
  // focus was yanked back to Cancel mid-interaction, and `previousFocus` was reassigned
  // to whatever was focused *inside* the dialog, so closing restored focus to a button
  // that no longer exists and it fell to <body>.
  //
  // Splitting it is the fix: run-once behaviour gets a run-once dependency list.
  useEffect(() => {
    if (!isOpen) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => { previousFocus.current?.focus(); };
  }, [isOpen]);

  // The listener genuinely depends on `onClose`, so it gets its own effect and may
  // re-subscribe freely — adding and removing a keydown listener is side-effect-free.
  useEffect(() => {
    if (!isOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
        next?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" onClick={onClose} />

      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-pop">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {message && (
          <p className="mt-2 text-sm text-muted">{message}</p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            ref={cancelRef}
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-ink-soft rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={() => { onConfirm(); onClose(); }}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
