import { create } from 'zustand';

export type Phase = 'focus' | 'short_break';

export const FOCUS_OPTIONS  = [25, 30, 50, 60, 75, 90]    as const;
export const BREAK_OPTIONS  = [5, 10, 15, 20, 25, 30]     as const;

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function playChime(): void {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.9);
  } catch {
    // Audio unavailable — silently skip
  }
}

function sendNotification(phase: Phase): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const isWork = phase === 'focus';
  new Notification(isWork ? 'Focus session complete' : 'Break over', {
    body: isWork ? 'Take a short break.' : 'Time to focus!',
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readMins(key: string, fallback: number): number {
  const stored = parseInt(localStorage.getItem(key) ?? '', 10);
  return isNaN(stored) ? fallback : stored;
}

function phaseSecs(phase: Phase, focusSecs: number, breakSecs: number): number {
  return phase === 'focus' ? focusSecs : breakSecs;
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface TimerState {
  phase: Phase;
  isRunning: boolean;
  timeLeft: number;
  autoAdvance: boolean;
  focusSecs: number;
  breakSecs: number;
  /** Wall-clock ms when the running phase ends; null when paused/stopped. */
  endsAt: number | null;

  setPhase: (phase: Phase) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  tick: () => void;
  toggleAutoAdvance: () => void;
  setFocusMins: (mins: number) => void;
  setBreakMins: (mins: number) => void;
}

const initFocusSecs = readMins('studeo:focusMins', 25) * 60;
const initBreakSecs = readMins('studeo:breakMins', 5)  * 60;

export const useTimerStore = create<TimerState>((set, get) => ({
  phase:       'focus',
  isRunning:   false,
  timeLeft:    initFocusSecs,
  autoAdvance: false,
  focusSecs:   initFocusSecs,
  breakSecs:   initBreakSecs,
  endsAt:      null,

  setPhase: (phase) => {
    const { focusSecs, breakSecs } = get();
    set({ phase, isRunning: false, endsAt: null, timeLeft: phaseSecs(phase, focusSecs, breakSecs) });
  },

  // Anchor a wall-clock end time so the countdown survives navigation and
  // self-corrects after the OS throttles background timers (no drift).
  start: () => set({ isRunning: true, endsAt: Date.now() + get().timeLeft * 1000 }),
  pause: () => {
    const { endsAt, timeLeft } = get();
    const remaining = endsAt != null ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : timeLeft;
    set({ isRunning: false, timeLeft: remaining, endsAt: null });
  },

  reset: () => {
    const { phase, focusSecs, breakSecs } = get();
    set({ isRunning: false, endsAt: null, timeLeft: phaseSecs(phase, focusSecs, breakSecs) });
  },

  toggleAutoAdvance: () => set(s => ({ autoAdvance: !s.autoAdvance })),

  // Driven once a second from the app shell. Remaining time is derived from
  // endsAt rather than decremented, so a missed tick can't accumulate drift.
  tick: () => {
    const { isRunning, endsAt, phase, autoAdvance, focusSecs, breakSecs } = get();
    if (!isRunning || endsAt == null) return;
    const remaining = Math.round((endsAt - Date.now()) / 1000);
    if (remaining > 0) {
      set({ timeLeft: remaining });
      return;
    }
    playChime();
    sendNotification(phase);
    const next: Phase = phase === 'focus' ? 'short_break' : 'focus';
    const nextSecs = phaseSecs(next, focusSecs, breakSecs);
    set({
      phase: next,
      timeLeft: nextSecs,
      isRunning: autoAdvance,
      endsAt: autoAdvance ? Date.now() + nextSecs * 1000 : null,
    });
  },

  setFocusMins: (mins) => {
    localStorage.setItem('studeo:focusMins', String(mins));
    const secs = mins * 60;
    const { phase } = get();
    set({ focusSecs: secs, ...(phase === 'focus' ? { timeLeft: secs, isRunning: false, endsAt: null } : {}) });
  },

  setBreakMins: (mins) => {
    localStorage.setItem('studeo:breakMins', String(mins));
    const secs = mins * 60;
    const { phase } = get();
    set({ breakSecs: secs, ...(phase === 'short_break' ? { timeLeft: secs, isRunning: false, endsAt: null } : {}) });
  },
}));
