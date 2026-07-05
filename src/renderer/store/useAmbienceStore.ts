import { create } from 'zustand';
import type { AmbienceId } from '../../shared/ambience';

// Focus Mode ambient-sound state. Kept engine-free (pure state): FocusMode wires the
// selection/volume to the Web Audio engine via effects. The *volume* is a real
// preference, persisted in the main process like the theme so it survives a relaunch.
// The *selection* is runtime-only and starts null every time, so opening the room is
// silent until you pick a sound — no startling autoplay.

const appSettings = window.api?.app?.initialSettings ?? {};

function readVolume(): number {
  const raw = appSettings['ambienceVolume'];
  const n = raw != null ? parseFloat(raw) : NaN;
  return isNaN(n) ? 0.6 : Math.min(1, Math.max(0, n));
}

interface AmbienceState {
  /** The sound currently selected/playing, or null when off. */
  activeId: AmbienceId | null;
  /** 0..1 master volume. */
  volume: number;
  /** Turn a sound on, or off if it's already the active one. */
  toggle: (id: AmbienceId) => void;
  setVolume: (v: number) => void;
  /** Silence ambience (used when leaving the room). */
  stop: () => void;
}

export const useAmbienceStore = create<AmbienceState>()((set) => ({
  activeId: null,
  volume: readVolume(),

  toggle: (id) => set(s => ({ activeId: s.activeId === id ? null : id })),

  setVolume: (v) => {
    const vol = Math.min(1, Math.max(0, v));
    window.api?.app?.setSetting('ambienceVolume', String(vol));
    set({ volume: vol });
  },

  stop: () => set({ activeId: null }),
}));
