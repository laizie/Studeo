import { create } from 'zustand';

// The distraction parking lot: intrusive thoughts jotted during a focus session,
// held until the session ends and they're dumped into a loose note. Parked thoughts
// are the whole point, so — unlike the ephemeral study list — this store persists to
// localStorage (manual snapshot, same approach as useTimerStore) so a thought
// survives navigating away or quitting the app before the flush.

export interface ParkedThought {
  id: string;
  text: string;
  at: number; // epoch ms captured — provenance / ordering
}

interface ParkingLotState {
  items: ParkedThought[];
  add: (text: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'studeo:parkingLot';

function readItems(): ParkedThought[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only well-formed rows — a corrupt snapshot must never crash the room.
    return parsed.filter(
      (i): i is ParkedThought =>
        i && typeof i.id === 'string' && typeof i.text === 'string' && typeof i.at === 'number',
    );
  } catch {
    return [];
  }
}

export const useParkingLotStore = create<ParkingLotState>()((set) => ({
  items: readItems(),

  add: (text) => set(s => {
    const trimmed = text.trim();
    if (!trimmed) return s; // don't park an empty thought
    return { items: [...s.items, { id: crypto.randomUUID(), text: trimmed, at: Date.now() }] };
  }),

  remove: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),

  clear: () => set({ items: [] }),
}));

// Snapshot every change so parked thoughts survive a navigation or full quit.
useParkingLotStore.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s.items));
  } catch {
    /* storage full / unavailable — best effort, the in-memory list still works */
  }
});
