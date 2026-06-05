import { create } from 'zustand';

export interface StudyListItem {
  id: string;
  type: 'assignment' | 'task';
  name: string;
  courseName?: string;
  courseColor?: string;
  done: boolean;
}

interface StudyListState {
  items: StudyListItem[];
  addItem: (item: Omit<StudyListItem, 'done'>) => void;
  removeItem: (id: string) => void;
  toggleDone: (id: string) => void;
  clear: () => void;
}

export const useStudyListStore = create<StudyListState>()((set) => ({
  items: [],

  addItem: (item) => set(s => {
    if (s.items.some(i => i.id === item.id)) return s;
    return { items: [...s.items, { ...item, done: false }] };
  }),

  removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),

  toggleDone: (id) => set(s => ({
    items: s.items.map(i => i.id === id ? { ...i, done: !i.done } : i),
  })),

  clear: () => set({ items: [] }),
}));
