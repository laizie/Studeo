import { create } from 'zustand';

// App-wide toast queue. Toasts are the quiet confirmation layer: every save
// gets a word of acknowledgment, and anything reversible carries an Undo.
// Kept deliberately small — max three visible, auto-dismissed, no variants.

export interface Toast {
  id: number;
  message: string;
  /** Label for the optional action button — in practice always "Undo". */
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 3;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (toast) => {
    const id = nextId++;
    set((s) => {
      const next = [...s.toasts, { ...toast, id }];
      // Cap the stack: drop the oldest (its timer too) instead of piling up.
      while (next.length > MAX_VISIBLE) {
        const dropped = next.shift();
        if (dropped) {
          clearTimeout(timers.get(dropped.id));
          timers.delete(dropped.id);
        }
      }
      return { toasts: next };
    });
    timers.set(id, setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS));
  },

  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },
}));

/** Fire-and-forget confirmation ("Added 'Quiz 2' · Fri, Mar 6"). */
export function showToast(message: string) {
  useToastStore.getState().show({ message });
}

/** Confirmation with a takeback. The undo runs once, then the toast closes. */
export function showUndoToast(message: string, onUndo: () => void) {
  useToastStore.getState().show({ message, actionLabel: 'Undo', onAction: onUndo });
}
