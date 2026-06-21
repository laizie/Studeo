import { create } from 'zustand';

// Whether the immersive Focus Mode overlay is open. Ephemeral UI state — like the
// QuickAdd / CommandPalette booleans — so it lives in its own tiny store rather
// than being threaded through props. The overlay itself is mounted once in Layout
// so the app-wide timer driver keeps running while it's open.
interface FocusState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  isOpen: false,
  open:  () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
