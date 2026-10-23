import { create } from 'zustand';
import {
  lightCandle, addCandleEvent, candleStatus, parseCandleRecord,
  type CandleRecord,
} from '../../shared/candleSession';

// The candle for the current (or most recent) focus block, as a replayable record
// (see shared/candleSession.ts). Focus Mode draws it; the timer drives it — calling
// light / pause / snuff at the moments a block starts, pauses, or is given up. A block
// that runs its full length needs no call: its candle burns down to the stub on its own
// at that same moment, because it was lit for exactly the block's length.
//
// Saved beside the timer's own resume snapshot (useTimerStore) and on the same
// occasions, so the two are always restored together: a candle burning when the app
// quits is still burning — or has burnt down — when it comes back, in step with the
// clock. If that snapshot ever moves to the main-process settings file, this should
// move with it.

const RECORD_KEY = 'studeo:focusCandle';

function readRecord(): CandleRecord | null {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    return raw ? parseCandleRecord(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeRecord(record: CandleRecord | null): void {
  try {
    if (record) localStorage.setItem(RECORD_KEY, JSON.stringify(record));
    else localStorage.removeItem(RECORD_KEY);
  } catch {
    /* storage unavailable — the candle just won't survive a restart */
  }
}

function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

interface CandleStoreState {
  record: CandleRecord | null;
  /**
   * A focus block started or carried on with `remainingMs` on the clock: relight the
   * paused candle, or light a fresh one if the last block's candle is done with.
   */
  light: (remainingMs: number) => void;
  pause: () => void;
  /** The block was given up early: put the flame out and leave the candle standing. */
  snuff: () => void;
}

export const useCandleStore = create<CandleStoreState>((set, get) => ({
  record: readRecord(),

  light: (remainingMs) => {
    const now = Date.now();
    const { record } = get();
    const status = record ? candleStatus(record, now) : null;
    if (status === 'lit') return;
    if (record && status === 'paused') {
      set({ record: addCandleEvent(record, 'resume', now) });
      return;
    }
    if (remainingMs > 0) set({ record: lightCandle(newSeed(), remainingMs, now) });
  },

  pause: () => {
    const { record } = get();
    if (record) set({ record: addCandleEvent(record, 'pause', Date.now()) });
  },

  snuff: () => {
    const { record } = get();
    if (record) set({ record: addCandleEvent(record, 'abandon', Date.now()) });
  },
}));

// addCandleEvent hands back the same object when nothing changed, so this writes only
// on real events — a handful per block.
useCandleStore.subscribe((state, prev) => {
  if (state.record !== prev.record) writeRecord(state.record);
});
