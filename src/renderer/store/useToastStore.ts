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

/** The most recent reversible action, kept so ⌘Z can reach it. */
interface UndoEntry {
  /** The toast that offered it (dismissed when the undo runs). */
  toastId: number;
  message: string;
  run: () => void;
  expiresAt: number;
}

interface ToastState {
  toasts: Toast[];
  lastUndo: UndoEntry | null;
  show: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
  /** Run the pending undo, if there still is one. Returns whether it fired. */
  undoLast: () => boolean;
}

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 3;

// ⌘Z reaches back further than the toast does. The toast is the *visible* offer
// and expires in 6s; the keyboard path stays open for a minute, so undoing three
// rows of keyboard work never means racing a countdown with the mouse.
const UNDO_WINDOW_MS = 60_000;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  lastUndo: null,

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
    return id;
  },

  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },

  undoLast: () => {
    const entry = get().lastUndo;
    if (!entry || Date.now() > entry.expiresAt) return false;
    // Clear first: an undo is single-use, and its own confirmation toast must
    // not become the next thing ⌘Z reaches for.
    set({ lastUndo: null });
    get().dismiss(entry.toastId);
    entry.run();
    return true;
  },
}));

/** Fire-and-forget confirmation ("Added 'Quiz 2' · Fri, Mar 6"). */
export function showToast(message: string) {
  useToastStore.getState().show({ message });
}

/**
 * Confirmation with a takeback. The undo runs once, then the toast closes.
 * It is also registered as the app's pending ⌘Z, so the same takeback is
 * reachable from the keyboard without hunting for the toast's button.
 */
export function showUndoToast(message: string, onUndo: () => void) {
  // One wrapped takeback behind both entry points (the toast button and ⌘Z), so
  // whichever fires first clears the other — an undo can never run twice.
  const run = () => {
    useToastStore.setState({ lastUndo: null });
    onUndo();
  };
  const id = useToastStore.getState().show({ message, actionLabel: 'Undo', onAction: run });
  useToastStore.setState({
    lastUndo: { toastId: id, message, run, expiresAt: Date.now() + UNDO_WINDOW_MS },
  });
}
