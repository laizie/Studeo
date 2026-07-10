import { X } from 'lucide-react';
import { useToastStore } from '../store/useToastStore';

/**
 * Renders the toast stack — bottom-right, above every dialog (z-scale: dialogs
 * 50, palette 70, toasts 80) so a confirmation is never hidden by the surface
 * that produced it. `aria-live` lets screen readers hear the confirmation the
 * moment it appears, without stealing focus from what the user is doing.
 */
export default function Toaster() {
  const toasts  = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-2"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className="animate-rise flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg"
        >
          <p className="min-w-0 flex-1 text-sm text-ink">{t.message}</p>
          {t.actionLabel && t.onAction && (
            <button
              onClick={() => { t.onAction?.(); dismiss(t.id); }}
              className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-soft hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            >
              {t.actionLabel}
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-muted hover:text-ink-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
