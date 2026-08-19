import { create } from 'zustand';
import type { FocusEntry } from '../../shared/focusList';

// What the focus list *is*: a selection of things to work on today. Ephemeral
// (it's about today, not a record), so it lives in a store rather than the DB.
//
// It deliberately holds no copy of what it points at — no name, no course, and
// no done flag. It used to hold all three, and each was a fact with two homes:
// ticking an assignment off in This Week or on its course page updated the row
// but not this copy, so the focus list went on showing it unticked. Renaming an
// assignment left the old name here in the same way.
//
// The rendered list is resolved from the live queries instead — see
// lib/useFocusList.ts. That's the repo's "derived values are computed, never
// stored" rule applied to UI state: one fact, one home, and no way for the two
// to disagree.
interface StudyListState {
  items: FocusEntry[];
  addItem: (item: FocusEntry) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

export const useStudyListStore = create<StudyListState>()((set) => ({
  items: [],

  addItem: (item) => set(s => {
    if (s.items.some(i => i.id === item.id)) return s;
    return { items: [...s.items, item] };
  }),

  removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),

  clear: () => set({ items: [] }),
}));
