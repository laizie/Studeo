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

  setPhase: (phase) => {
    const { focusSecs, breakSecs } = get();
    set({ phase, isRunning: false, timeLeft: phaseSecs(phase, focusSecs, breakSecs) });
  },

  start: () => set({ isRunning: true }),
  pause: () => set({ isRunning: false }),

  reset: () => {
    const { phase, focusSecs, breakSecs } = get();
    set({ isRunning: false, timeLeft: phaseSecs(phase, focusSecs, breakSecs) });
  },

  toggleAutoAdvance: () => set(s => ({ autoAdvance: !s.autoAdvance })),

  tick: () => {
    const { timeLeft, phase, autoAdvance, focusSecs, breakSecs } = get();
    if (timeLeft <= 1) {
      playChime();
      sendNotification(phase);
      const next: Phase = phase === 'focus' ? 'short_break' : 'focus';
      set({ phase: next, timeLeft: phaseSecs(next, focusSecs, breakSecs), isRunning: autoAdvance });
    } else {
      set({ timeLeft: timeLeft - 1 });
    }
  },

  setFocusMins: (mins) => {
    localStorage.setItem('studeo:focusMins', String(mins));
    const secs = mins * 60;
    const { phase } = get();
    set({ focusSecs: secs, ...(phase === 'focus' ? { timeLeft: secs, isRunning: false } : {}) });
  },

  setBreakMins: (mins) => {
    localStorage.setItem('studeo:breakMins', String(mins));
    const secs = mins * 60;
    const { phase } = get();
    set({ breakSecs: secs, ...(phase === 'short_break' ? { timeLeft: secs, isRunning: false } : {}) });
  },
}));
