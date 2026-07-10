import { useEffect, type RefObject } from 'react';

/**
 * Keeps Tab / Shift-Tab cycling inside an open dialog, and returns focus to
 * whatever had it when the dialog closes. Without this, keyboard users tab
 * "out the back" of a modal into the dimmed page behind it.
 *
 * ConfirmDialog pioneered the pattern with its two fixed buttons; this is the
 * generalized version for dialogs whose focusable contents vary (forms, lists).
 */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const previousFocus = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // Also catch focus that's already escaped (or never entered).
      const inside = container.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [active, containerRef]);
}
